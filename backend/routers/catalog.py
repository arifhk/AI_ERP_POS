"""Master data with maker-checker approval, plus product SKU allocation."""

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user
from database import get_session
from rbac import (
    assert_tenant_access,
    bypasses_maker_checker,
    is_platform_admin,
    is_tenant_user,
    require_tenant_manager,
    restrict,
    write_tenant,
)
from models import (
    ApprovalRequest,
    AuditLog,
    BrandMaster,
    CategoryMaster,
    CodeMaster,
    Product,
    SubCategoryMaster,
    User,
    VendorMaster,
)

masters_router = APIRouter()
approvals_router = APIRouter()

ENTITY_TYPES = {"category", "sub_category", "brand", "vendor", "code"}
MODULE_LABELS = {
    "category": "Category",
    "sub_category": "SubCategory",
    "brand": "Brand",
    "vendor": "Vendor",
    "code": "CodeMaster",
    "product_bulk": "Product",
}


def _is_admin(user: User) -> bool:
    """Immediate writes: Super Admin and Tenant Admin. Tenant users stay in the queue."""
    return bypasses_maker_checker(user)


class MasterWrite(SQLModel):
    name: str = ""
    code_number: str = ""
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None
    contact_number: str = ""
    email: str = ""
    address: str = ""
    status: str = "Active"


class ApprovalRead(SQLModel):
    id: int
    entity_type: str
    action: str
    entity_id: Optional[int] = None
    payload: dict[str, Any] = {}
    status: str
    reason: Optional[str] = None
    user_id: Optional[int] = None
    module_name: Optional[str] = None
    action_type: Optional[str] = None
    admin_reason: Optional[str] = None
    requested_by: int
    reviewed_by: Optional[int] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None


class DenyBody(SQLModel):
    reason: str


def _clean_name(value: str) -> str:
    name = value.strip()
    if not name or len(name) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required.")
    return name


async def _category(session: AsyncSession, category_id: int) -> CategoryMaster:
    row = await session.get(CategoryMaster, category_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    return row


async def _sub_category(session: AsyncSession, sub_category_id: int) -> SubCategoryMaster:
    row = await session.get(SubCategoryMaster, sub_category_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sub-category not found.")
    return row


async def apply_master_change(
    session: AsyncSession,
    entity_type: str,
    action: str,
    entity_id: Optional[int],
    payload: dict[str, Any],
) -> int:
    """Write master data and cascade the new labels onto linked products."""
    force = bool(payload.pop("_force", False))
    if action == "delete":
        return await _delete_master(session, entity_type, entity_id or 0, force=force)
    if action == "update" and set(payload.keys()) <= {"is_active", "is_hidden"}:
        return await _apply_visibility(session, entity_type, entity_id or 0, payload)
    if entity_type == "category":
        name = _clean_name(str(payload.get("name") or ""))
        if action == "create":
            row = CategoryMaster(name=name, tenant_id=payload.get("tenant_id"))
            session.add(row)
            await session.flush()
            return row.id or 0
        row = await _category(session, entity_id or 0)
        row.name = name
        session.add(row)
        products = (await session.exec(select(Product).where(Product.category_id == row.id))).all()
        for product in products:
            product.category = name
            session.add(product)
        return row.id or 0

    if entity_type == "sub_category":
        name = _clean_name(str(payload.get("name") or ""))
        category_id = int(payload.get("category_id") or 0)
        category = await _category(session, category_id)
        if action == "create":
            row = SubCategoryMaster(name=name, category_id=category_id, tenant_id=payload.get("tenant_id"))
            session.add(row)
            await session.flush()
            return row.id or 0
        row = await _sub_category(session, entity_id or 0)
        row.name = name
        row.category_id = category_id
        session.add(row)
        products = (await session.exec(select(Product).where(Product.sub_category_id == row.id))).all()
        for product in products:
            product.sub_category = name
            product.category_id = category_id
            product.category = category.name
            session.add(product)
        return row.id or 0

    if entity_type == "brand":
        name = _clean_name(str(payload.get("name") or ""))
        if action == "create":
            row = BrandMaster(name=name, tenant_id=payload.get("tenant_id"))
            session.add(row)
            await session.flush()
            return row.id or 0
        row = await session.get(BrandMaster, entity_id or 0)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
        row.name = name
        session.add(row)
        products = (await session.exec(select(Product).where(Product.brand_id == row.id))).all()
        for product in products:
            product.brand = name
            session.add(product)
        return row.id or 0

    if entity_type == "vendor":
        name = _clean_name(str(payload.get("name") or ""))
        contact_number = str(payload.get("contact_number") or "").strip()[:40]
        email = str(payload.get("email") or "").strip()[:255]
        address = str(payload.get("address") or "").strip()[:500]
        vendor_status = str(payload.get("status") or "Active").strip().lower()
        if email and "@" not in email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is not valid.")
        if vendor_status not in {"active", "inactive"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status must be Active or Inactive.")
        stored_status = "Active" if vendor_status == "active" else "Inactive"
        if action == "create":
            row = VendorMaster(
                name=name,
                contact_number=contact_number,
                email=email,
                address=address,
                status=stored_status,
                tenant_id=payload.get("tenant_id"),
            )
            session.add(row)
            row.is_active = stored_status == "Active"
            await session.flush()
            return row.id or 0
        row = await session.get(VendorMaster, entity_id or 0)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")
        row.name = name
        row.contact_number = contact_number
        row.email = email
        row.address = address
        row.status = stored_status
        row.is_active = stored_status == "Active"
        session.add(row)
        products = (await session.exec(select(Product).where(Product.vendor_id == row.id))).all()
        for product in products:
            product.vendor = name
            session.add(product)
        return row.id or 0

    if entity_type == "code":
        code_number = str(payload.get("code_number") or "").strip()
        name = str(payload.get("name") or "").strip()
        category_id = int(payload.get("category_id") or 0)
        sub_category_id = int(payload.get("sub_category_id") or 0)
        if not code_number or not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code number and name are required.")
        category = await _category(session, category_id)
        sub_category = await _sub_category(session, sub_category_id)
        if action == "create":
            row = CodeMaster(
                code_number=code_number[:20],
                name=name[:255],
                category_id=category_id,
                sub_category_id=sub_category_id,
                tenant_id=payload.get("tenant_id"),
            )
            session.add(row)
            await session.flush()
            return row.id or 0
        row = await session.get(CodeMaster, entity_id or 0)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found.")
        row.code_number = code_number[:20]
        row.name = name[:255]
        row.category_id = category_id
        row.sub_category_id = sub_category_id
        session.add(row)
        products = (await session.exec(select(Product).where(Product.code_id == row.id))).all()
        for product in products:
            product.name = row.name
            product.category = category.name
            product.category_id = category.id
            product.sub_category = sub_category.name
            product.sub_category_id = sub_category.id
            if product.design_number.strip():
                item_code = f"{row.code_number}-{product.design_number.strip()}"
                product.item_code = item_code
                product.design_code = item_code
            session.add(product)
        return row.id or 0

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown master type.")


def _flags(row: Any) -> dict[str, bool]:
    return {
        "is_active": bool(getattr(row, "is_active", True)),
        "is_hidden": bool(getattr(row, "is_hidden", False)),
    }


async def _master_row(session: AsyncSession, entity_type: str, entity_id: int) -> Any:
    model = {
        "category": CategoryMaster,
        "sub_category": SubCategoryMaster,
        "brand": BrandMaster,
        "vendor": VendorMaster,
        "code": CodeMaster,
    }.get(entity_type)
    if model is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown master type.")
    row = await session.get(model, entity_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found.")
    return row


async def _apply_visibility(session: AsyncSession, entity_type: str, entity_id: int, payload: dict[str, Any]) -> int:
    row = await _master_row(session, entity_type, entity_id)
    if "is_active" in payload and payload["is_active"] is not None:
        row.is_active = bool(payload["is_active"])
        if entity_type == "vendor":
            row.status = "Active" if row.is_active else "Inactive"
    if "is_hidden" in payload and payload["is_hidden"] is not None:
        row.is_hidden = bool(payload["is_hidden"])
    session.add(row)
    return entity_id


async def _block_if_present(session: AsyncSession, statement, message: str) -> None:
    if (await session.exec(statement)).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)


async def _assert_master_deletable(session: AsyncSession, entity_type: str, entity_id: int) -> None:
    if entity_type == "category":
        await _block_if_present(
            session,
            select(SubCategoryMaster).where(SubCategoryMaster.category_id == entity_id),
            "Remove this category's sub-categories before deleting it.",
        )
        await _block_if_present(
            session,
            select(CodeMaster).where(CodeMaster.category_id == entity_id),
            "Remove codes that use this category before deleting it.",
        )
    elif entity_type == "sub_category":
        await _block_if_present(
            session,
            select(CodeMaster).where(CodeMaster.sub_category_id == entity_id),
            "Remove codes that use this sub-category before deleting it.",
        )


async def _delete_master(session: AsyncSession, entity_type: str, entity_id: int, force: bool = False) -> int:
    """Remove a master row and detach products. Super Admin may force a delete."""
    if not force:
        await _assert_master_deletable(session, entity_type, entity_id)
    if entity_type == "category":
        row = await _category(session, entity_id)
        products = (await session.exec(select(Product).where(Product.category_id == entity_id))).all()
        for product in products:
            product.category_id = None
            product.category = ""
            session.add(product)
        await session.delete(row)
        return entity_id

    if entity_type == "sub_category":
        row = await _sub_category(session, entity_id)
        products = (await session.exec(select(Product).where(Product.sub_category_id == entity_id))).all()
        for product in products:
            product.sub_category_id = None
            product.sub_category = ""
            session.add(product)
        await session.delete(row)
        return entity_id

    if entity_type == "brand":
        row = await session.get(BrandMaster, entity_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
        products = (await session.exec(select(Product).where(Product.brand_id == entity_id))).all()
        for product in products:
            product.brand_id = None
            product.brand = ""
            session.add(product)
        await session.delete(row)
        return entity_id

    if entity_type == "vendor":
        row = await session.get(VendorMaster, entity_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")
        products = (await session.exec(select(Product).where(Product.vendor_id == entity_id))).all()
        for product in products:
            product.vendor_id = None
            product.vendor = ""
            session.add(product)
        await session.delete(row)
        return entity_id

    if entity_type == "code":
        row = await session.get(CodeMaster, entity_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found.")
        products = (await session.exec(select(Product).where(Product.code_id == entity_id))).all()
        for product in products:
            product.code_id = None
            session.add(product)
        await session.delete(row)
        return entity_id

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown master type.")


async def _master_snapshot(session: AsyncSession, entity_type: str, entity_id: int) -> dict[str, Any]:
    if entity_type == "category":
        row = await _category(session, entity_id)
        return {"name": row.name}
    if entity_type == "sub_category":
        row = await _sub_category(session, entity_id)
        return {"name": row.name, "category_id": row.category_id}
    if entity_type == "brand":
        row = await session.get(BrandMaster, entity_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
        return {"name": row.name}
    if entity_type == "vendor":
        row = await session.get(VendorMaster, entity_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found.")
        return {
            "name": row.name,
            "contact_number": row.contact_number,
            "email": row.email,
            "address": row.address,
            "status": row.status,
        }
    if entity_type == "code":
        row = await session.get(CodeMaster, entity_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found.")
        return {
            "code_number": row.code_number,
            "name": row.name,
            "category_id": row.category_id,
            "sub_category_id": row.sub_category_id,
        }
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown master type.")


async def _queue_or_apply(
    session: AsyncSession,
    user: User,
    entity_type: str,
    action: str,
    entity_id: Optional[int],
    payload: dict[str, Any],
) -> dict[str, Any]:
    if entity_type not in ENTITY_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown master type.")
    payload = dict(payload)
    if entity_id is not None:
        existing = await _master_row(session, entity_type, entity_id)
        assert_tenant_access(user, existing.tenant_id)
        payload.setdefault("tenant_id", existing.tenant_id)
    payload["tenant_id"] = write_tenant(user, payload.get("tenant_id"))
    if is_platform_admin(user):
        payload["_force"] = True
    if _is_admin(user):
        saved_id = await apply_master_change(session, entity_type, action, entity_id, payload)
        await session.commit()
        return {"status": "Approved", "entity_id": saved_id, "pending": False}
    action_type = {"create": "Create", "update": "Update", "delete": "Delete"}.get(action, action.title())
    request = ApprovalRequest(
        entity_type=entity_type,
        action=action,
        entity_id=entity_id,
        payload=payload,
        status="Pending",
        tenant_id=payload["tenant_id"],
        requested_by=user.id or 0,
        user_id=user.id,
        module_name=MODULE_LABELS.get(entity_type, entity_type),
        action_type=action_type,
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return {
        "status": "Pending",
        "request_id": request.id,
        "pending": True,
        "message": "Submitted for Admin Approval",
        "user_id": user.id,
        "module_name": request.module_name,
        "action_type": action_type,
    }


@masters_router.get("/catalog")
async def catalog_snapshot(
    tenant_id: Optional[int] = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    categories = (await session.exec(restrict(select(CategoryMaster).order_by(CategoryMaster.name), CategoryMaster.tenant_id, current_user, tenant_id))).all()
    sub_categories = (await session.exec(restrict(select(SubCategoryMaster).order_by(SubCategoryMaster.name), SubCategoryMaster.tenant_id, current_user, tenant_id))).all()
    brands = (await session.exec(restrict(select(BrandMaster).order_by(BrandMaster.name), BrandMaster.tenant_id, current_user, tenant_id))).all()
    vendors = (await session.exec(restrict(select(VendorMaster).order_by(VendorMaster.name), VendorMaster.tenant_id, current_user, tenant_id))).all()
    codes = (await session.exec(restrict(select(CodeMaster).order_by(CodeMaster.code_number), CodeMaster.tenant_id, current_user, tenant_id))).all()
    return {
        "categories": [{"id": row.id, "name": row.name, **_flags(row)} for row in categories],
        "sub_categories": [
            {"id": row.id, "name": row.name, "category_id": row.category_id, **_flags(row)} for row in sub_categories
        ],
        "brands": [{"id": row.id, "name": row.name, **_flags(row)} for row in brands],
        "vendors": [
            {
                "id": row.id,
                "name": row.name,
                "contact_number": row.contact_number or "",
                "email": row.email or "",
                "address": row.address or "",
                "status": row.status or "Active",
                **_flags(row),
            }
            for row in vendors
        ],
        "codes": [
            {
                "id": row.id,
                "code_number": row.code_number,
                "name": row.name,
                "category_id": row.category_id,
                "sub_category_id": row.sub_category_id,
                **_flags(row),
            }
            for row in codes
        ],
    }


@masters_router.post("/{entity_type}")
async def create_master(
    entity_type: str,
    payload: MasterWrite,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        return await _queue_or_apply(session, current_user, entity_type, "create", None, payload.model_dump())
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That value already exists.") from None


class FlagWrite(SQLModel):
    is_active: Optional[bool] = None
    is_hidden: Optional[bool] = None


@masters_router.patch("/{entity_type}/{entity_id}/flags")
async def update_master_flags(
    entity_type: str,
    entity_id: int,
    payload: FlagWrite,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update.")
    await _master_row(session, entity_type, entity_id)
    return await _queue_or_apply(session, current_user, entity_type, "update", entity_id, changes)


@masters_router.patch("/{entity_type}/{entity_id}")
async def update_master(
    entity_type: str,
    entity_id: int,
    payload: MasterWrite,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        return await _queue_or_apply(
            session,
            current_user,
            entity_type,
            "update",
            entity_id,
            payload.model_dump(),
        )
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That value already exists.") from None


@masters_router.delete("/{entity_type}/{entity_id}")
async def delete_master(
    entity_type: str,
    entity_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    snapshot = await _master_snapshot(session, entity_type, entity_id)
    if not is_platform_admin(current_user):
        await _assert_master_deletable(session, entity_type, entity_id)
    try:
        return await _queue_or_apply(session, current_user, entity_type, "delete", entity_id, snapshot)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This record is still linked and cannot be deleted.") from None


@approvals_router.get("/", response_model=list[ApprovalRead])
async def list_approvals(
    tenant_id: Optional[int] = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ApprovalRequest]:
    statement = restrict(select(ApprovalRequest).order_by(ApprovalRequest.id.desc()), ApprovalRequest.tenant_id, current_user, tenant_id)
    if is_tenant_user(current_user):
        statement = statement.where(ApprovalRequest.requested_by == current_user.id)
    rows = (await session.exec(statement.limit(100))).all()
    return list(rows)


@approvals_router.post("/{request_id}/approve", response_model=ApprovalRead)
async def approve_request(
    request_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ApprovalRequest:
    require_tenant_manager(current_user)
    request = await session.get(ApprovalRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
    assert_tenant_access(current_user, request.tenant_id)
    if request.status != "Pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be approved.")
    try:
        if request.entity_type == "product_bulk":
            from routers.products import apply_approved_product_bulk

            await apply_approved_product_bulk(session, request.payload or {}, current_user)
        elif request.entity_type == "product":
            from routers.products import apply_approved_product_change

            await apply_approved_product_change(session, request.action, request.entity_id or 0, request.payload or {}, current_user)
        else:
            await apply_master_change(
                session,
                request.entity_type,
                request.action,
                request.entity_id,
                {**(request.payload or {}), "_force": is_platform_admin(current_user)},
            )
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That value already exists.") from None
    request.status = "Approved"
    request.reviewed_by = current_user.id
    request.reviewed_at = datetime.now(timezone.utc)
    session.add(request)
    session.add(
        AuditLog(
            tenant_id=request.tenant_id,
            user_id=current_user.id,
            action_type="Approved",
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            changes={"request": {"old": "Pending", "new": "Approved"}},
            reason=request.reason,
            method="Web UI",
        )
    )
    await session.commit()
    await session.refresh(request)
    return request


@approvals_router.post("/{request_id}/deny", response_model=ApprovalRead)
async def deny_request(
    request_id: int,
    body: DenyBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ApprovalRequest:
    require_tenant_manager(current_user)
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A reason is required to deny a request.")
    request = await session.get(ApprovalRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
    assert_tenant_access(current_user, request.tenant_id)
    if request.status != "Pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be denied.")
    request.status = "Rejected"
    request.reason = reason[:500]
    request.admin_reason = reason[:500]
    request.reviewed_by = current_user.id
    request.reviewed_at = datetime.now(timezone.utc)
    session.add(request)
    session.add(
        AuditLog(
            tenant_id=request.tenant_id,
            user_id=current_user.id,
            action_type="Rejected",
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            changes={"status": {"old": "Pending", "new": "Rejected"}},
            reason=reason[:500],
            method="Web UI",
        )
    )
    await session.commit()
    await session.refresh(request)
    return request


@approvals_router.post("/{request_id}/resubmit", response_model=ApprovalRead)
async def resubmit_request(
    request_id: int,
    payload: MasterWrite,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ApprovalRequest:
    request = await session.get(ApprovalRequest, request_id)
    if request is None or request.requested_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
    if request.status not in {"Denied", "Rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only rejected requests can be resubmitted.")
    if request.entity_type != "product_bulk":
        request.payload = payload.model_dump()
    request.status = "Pending"
    request.reason = None
    request.reviewed_by = None
    request.reviewed_at = None
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request
