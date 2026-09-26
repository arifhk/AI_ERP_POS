from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import SQLModel, col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user
from rbac import assert_tenant_access, bypasses_maker_checker, read_scope, restrict, write_tenant
from database import get_session
from models import (
    ApprovalRequest,
    AuditLog,
    Branch,
    BrandMaster,
    CategoryMaster,
    CodeMaster,
    Product,
    ProductVariant,
    SubCategoryMaster,
    Tenant,
    User,
    VendorMaster,
)
from routers.settings import get_default_vat

router = APIRouter()

_AUDIT_FIELDS = (
    "name",
    "barcode",
    "item_code",
    "design_number",
    "category",
    "sub_category",
    "brand",
    "vendor",
    "price",
    "mrp",
    "purchase_price",
    "wsp",
    "sale_vat",
    "is_active",
    "is_hidden",
    "ec_product",
    "stock_quantity",
)


def _audit_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _product_snapshot(product: Product) -> dict[str, Any]:
    return {field: _audit_value(getattr(product, field, None)) for field in _AUDIT_FIELDS}


def _field_changes(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    changes: dict[str, dict[str, Any]] = {}
    for field in _AUDIT_FIELDS:
        old = before.get(field)
        new = after.get(field)
        if old != new:
            changes[field] = {"old": old, "new": new}
    return changes


def _record_audit(
    session: AsyncSession,
    *,
    user_id: Optional[int],
    action_type: str,
    entity_id: Optional[int],
    changes: dict[str, Any],
    reason: Optional[str],
    method: str,
    tenant_id: Optional[int] = None,
) -> None:
    if not changes and action_type == "Updated":
        return
    session.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action_type=action_type,
            entity_type="Product",
            entity_id=entity_id,
            changes=changes,
            reason=(reason or "").strip() or None,
            method=(method or "Web UI").strip()[:40] or "Web UI",
        )
    )


class ProductCreate(SQLModel):
    tenant_id: int
    name: str
    barcode: str
    price: float
    branch_id: Optional[int] = None
    stock_quantity: int = 0
    is_active: bool = True
    additional_barcodes: list[str] = []
    image: Optional[str] = None
    category: str = ""
    sub_category: str = ""
    brand: str = ""
    vendor: str = ""
    design_code: str = ""
    design_number: str = ""
    item_code: Optional[str] = None
    code_id: Optional[int] = None
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None
    brand_id: Optional[int] = None
    vendor_id: Optional[int] = None
    ec_product: bool = False
    purchase_price: float = 0
    mrp: float = 0
    wsp: float = 0
    price_incl_vat: bool = False
    sdc_vat_code: str = ""
    sale_vat: float = 0
    custom_vat: bool = False
    variations: dict[str, Any] = {}
    variants: list["VariantWrite"] = []


class VariantWrite(SQLModel):
    sku: str = ""
    attributes: dict[str, str] = {}
    inherit_parent: bool = True
    stock_quantity: int = 0
    price: Optional[float] = None
    purchase_price: Optional[float] = None
    mrp: Optional[float] = None
    wsp: Optional[float] = None
    image: Optional[str] = None
    vendor: Optional[str] = None
    custom_vat: bool = False
    sale_vat: Optional[float] = None


class VariantRead(SQLModel):
    id: int
    sku: str
    attributes: dict[str, str] = {}
    inherit_parent: bool = True
    stock_quantity: int = 0
    price: Optional[float] = None
    purchase_price: Optional[float] = None
    mrp: Optional[float] = None
    wsp: Optional[float] = None
    image: Optional[str] = None
    vendor: Optional[str] = None
    custom_vat: bool = False
    sale_vat: Optional[float] = None
    effective_price: float = 0
    effective_vendor: str = ""
    effective_sale_vat: float = 0


class ProductUpdate(SQLModel):
    tenant_id: Optional[int] = None
    name: Optional[str] = None
    barcode: Optional[str] = None
    price: Optional[float] = None
    branch_id: Optional[int] = None
    stock_quantity: Optional[int] = None
    is_active: Optional[bool] = None
    additional_barcodes: Optional[list[str]] = None
    image: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    brand: Optional[str] = None
    vendor: Optional[str] = None
    design_code: Optional[str] = None
    design_number: Optional[str] = None
    item_code: Optional[str] = None
    code_id: Optional[int] = None
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None
    brand_id: Optional[int] = None
    vendor_id: Optional[int] = None
    ec_product: Optional[bool] = None
    purchase_price: Optional[float] = None
    mrp: Optional[float] = None
    wsp: Optional[float] = None
    price_incl_vat: Optional[bool] = None
    sdc_vat_code: Optional[str] = None
    sale_vat: Optional[float] = None
    custom_vat: Optional[bool] = None
    variations: Optional[dict[str, Any]] = None
    variants: Optional[list[VariantWrite]] = None


class ProductRead(SQLModel):
    id: int
    tenant_id: int
    branch_id: Optional[int] = None
    name: str
    barcode: str
    additional_barcodes: list[str] = []
    image: Optional[str] = None
    category: str = ""
    sub_category: str = ""
    brand: str = ""
    vendor: str = ""
    design_code: str = ""
    design_number: str = ""
    item_code: Optional[str] = None
    code_id: Optional[int] = None
    category_id: Optional[int] = None
    sub_category_id: Optional[int] = None
    brand_id: Optional[int] = None
    vendor_id: Optional[int] = None
    ec_product: bool = False
    purchase_price: float = 0
    mrp: float = 0
    wsp: float = 0
    price_incl_vat: bool = False
    sdc_vat_code: str = ""
    sale_vat: float = 0
    custom_vat: bool = False
    variations: dict[str, Any] = {}
    variants: list[VariantRead] = []
    price: float
    stock_quantity: int
    is_active: bool
    is_hidden: bool = False
    created_at: datetime


class BulkVariantIn(SQLModel):
    row: int = 0
    attributes: dict[str, str] = {}
    inherit_parent: bool = True
    mrp: Optional[float] = None
    price: Optional[float] = None


class BulkProductIn(SQLModel):
    row: int = 0
    code_number: str = ""
    design_number: str = ""
    brand: str = ""
    vendor: str = ""
    ec_product: bool = False
    purchase_price: float = 0
    mrp: float = 0
    price: float = 0
    wsp: float = 0
    custom_vat: bool = False
    sale_vat: float = 0
    additional_barcodes: list[str] = []
    variants: list[BulkVariantIn] = []


class BulkImportRequest(SQLModel):
    tenant_id: int = 1
    branch_id: Optional[int] = 1
    products: list[BulkProductIn] = []


class BulkRowError(SQLModel):
    row: int
    message: str


class BulkImportResult(SQLModel):
    created: int
    variants_created: int
    skipped: int
    queued: int = 0
    pending_approval: bool = False
    errors: list[BulkRowError]


ProductCreate.model_rebuild()

_PRODUCT_LOAD = (
    selectinload(Product.variants),
    selectinload(Product.order_items),
    selectinload(Product.purchases),
    selectinload(Product.sales_returns),
    selectinload(Product.tenant),
    selectinload(Product.branch),
)


async def _get_product(session: AsyncSession, product_id: int, user: Optional[User] = None) -> Product:
    statement = (
        select(Product)
        .where(Product.id == product_id)
        .options(*_PRODUCT_LOAD)
        .execution_options(populate_existing=True)
    )
    product = (await session.exec(statement)).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if user is not None:
        assert_tenant_access(user, product.tenant_id)
    return product


async def _validate_catalog_scope(
    session: AsyncSession,
    tenant_id: int,
    branch_id: Optional[int],
) -> None:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if branch_id is not None:
        branch = await session.get(Branch, branch_id)
        if branch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
        if branch.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch does not belong to the given tenant",
            )


def _clean_additional_barcodes(codes: list[str], primary: str) -> list[str]:
    """Keep distinct manufacturer codes that do not replace the primary SKU."""
    primary_key = primary.strip().lower()
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in codes:
        code = raw.strip()
        if not code:
            continue
        if len(code) > 80:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Additional barcode is too long",
            )
        key = code.lower()
        if key == primary_key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Additional barcode matches the primary SKU",
            )
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(code)
    return cleaned


def _product_codes(product: Product) -> set[str]:
    codes = {product.barcode.strip().lower()}
    for extra in product.additional_barcodes or []:
        if isinstance(extra, str) and extra.strip():
            codes.add(extra.strip().lower())
    for variant in product.variants or []:
        if variant.sku and variant.sku.strip():
            codes.add(variant.sku.strip().lower())
    return codes


async def _assert_codes_available(
    session: AsyncSession,
    primary: str,
    extras: list[str],
    exclude_id: Optional[int] = None,
) -> None:
    wanted = {primary.strip().lower(), *(code.lower() for code in extras)}
    rows = (await session.exec(select(Product).options(selectinload(Product.variants)))).all()
    for product in rows:
        if exclude_id is not None and product.id == exclude_id:
            continue
        if wanted & _product_codes(product):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Barcode already exists",
            )


def _clean_image(image: Optional[str]) -> Optional[str]:
    if image is None or not image.strip():
        return None
    value = image.strip()
    if not value.startswith("data:image/webp;base64,"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product image must be a compressed WebP data URL",
        )
    if len(value) > 120_000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product image must stay under about 50KB",
        )
    return value


def _clean_variations(raw: Optional[dict[str, Any]]) -> dict[str, Any]:
    source = raw or {}
    attributes_raw = source.get("attributes") if isinstance(source, dict) else []
    items_raw = source.get("items") if isinstance(source, dict) else []
    attributes: list[dict[str, Any]] = []
    if isinstance(attributes_raw, list):
        for entry in attributes_raw[:12]:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or "").strip()[:80]
            values_raw = entry.get("values") if isinstance(entry.get("values"), list) else []
            values = [str(value).strip()[:80] for value in values_raw if str(value).strip()]
            if name and values:
                attributes.append({"name": name, "values": values[:30]})
    items: list[dict[str, Any]] = []
    if isinstance(items_raw, list):
        for entry in items_raw[:200]:
            if not isinstance(entry, dict):
                continue
            combination = entry.get("combination") if isinstance(entry.get("combination"), dict) else {}
            items.append(
                {
                    "sku": str(entry.get("sku") or "").strip()[:80],
                    "combination": {str(key)[:80]: str(value)[:80] for key, value in combination.items()},
                    "purchase_price": max(0, float(entry.get("purchase_price") or 0)),
                    "mrp": max(0, float(entry.get("mrp") or 0)),
                    "stock_quantity": max(0, int(entry.get("stock_quantity") or 0)),
                }
            )
    return {"attributes": attributes, "items": items}


def _prepare_variants(raw: list[VariantWrite], base_sku: str) -> list[dict[str, Any]]:
    prepared: list[dict[str, Any]] = []
    seen: set[str] = set()
    sequence = 1
    for entry in raw[:200]:
        attributes = {
            str(key).strip()[:80]: str(value).strip()[:80]
            for key, value in (entry.attributes or {}).items()
            if str(key).strip() and str(value).strip()
        }
        sku = entry.sku.strip()[:80]
        if not sku:
            sku = f"{base_sku}-{sequence:02d}"
        while sku.lower() in seen or sku.lower() == base_sku.strip().lower():
            sequence += 1
            sku = f"{base_sku}-{sequence:02d}"
        seen.add(sku.lower())
        sequence += 1
        inherit = entry.inherit_parent
        image = None if inherit or not entry.image else _clean_image(entry.image)
        prepared.append(
            {
                "sku": sku,
                "attributes": attributes,
                "inherit_parent": inherit,
                "stock_quantity": max(0, int(entry.stock_quantity or 0)),
                "price": None if inherit else entry.price,
                "purchase_price": None if inherit else entry.purchase_price,
                "mrp": None if inherit else entry.mrp,
                "wsp": None if inherit else entry.wsp,
                "image": image,
                "vendor": None if inherit or not (entry.vendor or "").strip() else entry.vendor.strip()[:120],
                "custom_vat": False if inherit else entry.custom_vat,
                "sale_vat": None if inherit or not entry.custom_vat else entry.sale_vat,
            }
        )
    return prepared


def _variants_from_payload(
    payload_variants: Optional[list[VariantWrite]],
    variations: Optional[dict[str, Any]],
    base_sku: str,
) -> list[dict[str, Any]]:
    if payload_variants:
        return _prepare_variants(payload_variants, base_sku)
    items = variations.get("items") if isinstance(variations, dict) else None
    if not isinstance(items, list) or not items:
        return []
    converted: list[VariantWrite] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        combination = item.get("combination") if isinstance(item.get("combination"), dict) else {}
        converted.append(
            VariantWrite(
                sku=str(item.get("sku") or ""),
                attributes={str(key): str(value) for key, value in combination.items()},
                inherit_parent=bool(item.get("inherit_parent", True)),
                stock_quantity=int(item.get("stock_quantity") or 0),
            )
        )
    return _prepare_variants(converted, base_sku)


async def _assert_variant_skus(
    session: AsyncSession,
    skus: list[str],
    exclude_product_id: Optional[int],
) -> None:
    if not skus:
        return
    keys = {sku.lower() for sku in skus}
    products = (await session.exec(select(Product))).all()
    for product in products:
        if product.barcode.strip().lower() in keys:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Barcode already exists")
    rows = (await session.exec(select(ProductVariant))).all()
    for row in rows:
        if exclude_product_id is not None and row.product_id == exclude_product_id:
            continue
        if row.sku.lower() in keys:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Barcode already exists")


async def _sync_variants(session: AsyncSession, product: Product, prepared: list[dict[str, Any]]) -> None:
    await session.refresh(product, attribute_names=["variants"])
    existing = list(product.variants or [])
    by_sku = {row.sku.lower(): row for row in existing}
    keep: set[str] = set()
    fresh: list[ProductVariant] = []
    for item in prepared:
        key = item["sku"].lower()
        keep.add(key)
        current = by_sku.get(key)
        if current is None:
            fresh.append(ProductVariant(product_id=product.id, **item))
            continue
        for field, value in item.items():
            setattr(current, field, value)
        session.add(current)
    if fresh:
        session.add_all(fresh)
    for row in existing:
        if row.sku.lower() not in keep:
            await session.delete(row)


def _parent_vat(product: Product, default_vat: float) -> float:
    if product.custom_vat:
        return float(product.sale_vat or 0)
    return default_vat


def _to_read(product: Product, default_vat: float, include_image: bool) -> ProductRead:
    parent_vat = _parent_vat(product, default_vat)
    item = ProductRead.model_validate(product, update={"variants": []})
    if not product.custom_vat:
        item.sale_vat = parent_vat
    if not include_image:
        item.image = None
    reads: list[VariantRead] = []
    for variant in product.variants or []:
        if variant.inherit_parent:
            price = product.price
            vendor = product.vendor
            vat = parent_vat
            image = product.image
        else:
            price = variant.mrp if variant.mrp is not None else product.price
            vendor = variant.vendor or product.vendor
            vat = float(variant.sale_vat) if variant.custom_vat and variant.sale_vat is not None else default_vat
            image = variant.image or product.image
        reads.append(
            VariantRead(
                id=variant.id or 0,
                sku=variant.sku,
                attributes={str(key): str(value) for key, value in (variant.attributes or {}).items()},
                inherit_parent=variant.inherit_parent,
                stock_quantity=variant.stock_quantity,
                price=variant.price,
                purchase_price=variant.purchase_price,
                mrp=variant.mrp,
                wsp=variant.wsp,
                image=image if include_image else None,
                vendor=variant.vendor,
                custom_vat=variant.custom_vat,
                sale_vat=variant.sale_vat,
                effective_price=float(price or 0),
                effective_vendor=vendor or "",
                effective_sale_vat=vat,
            )
        )
    item.variants = reads
    return item


def _matches_barcode(product: Product, term: str) -> bool:
    key = term.strip().lower()
    if not key:
        return False
    return key in _product_codes(product)


@router.post("/", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    x_audit_method: str = Header(default="Web UI"),
    x_audit_reason: Optional[str] = Header(default=None),
) -> ProductRead:
    payload.tenant_id = write_tenant(current_user, payload.tenant_id)
    await _validate_catalog_scope(session, payload.tenant_id, payload.branch_id)
    sku = await allocate_next_sku(session)
    extras = _clean_additional_barcodes(payload.additional_barcodes, sku)
    await _assert_codes_available(session, sku, extras)
    prepared = _variants_from_payload(payload.variants, payload.variations, sku)
    await _assert_variant_skus(session, [item["sku"] for item in prepared], None)
    default_vat = await get_default_vat(session)
    item_code = (payload.item_code or "").strip()
    if not item_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item code is required.")
    if await _item_code_taken(session, item_code):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item code already exists.")
    data = payload.model_dump(exclude={"variants"})
    data["barcode"] = sku
    data["item_code"] = item_code
    data["design_code"] = item_code
    data["design_number"] = payload.design_number.strip()
    data["additional_barcodes"] = extras
    data["image"] = _clean_image(payload.image)
    data["variations"] = _clean_variations(payload.variations)
    if not payload.custom_vat:
        data["sale_vat"] = default_vat
    if not _is_admin_user(current_user):
        session.add(
            ApprovalRequest(
                tenant_id=data["tenant_id"],
                entity_type="product",
                action="create",
                payload={**data, "variants": prepared},
                status="Pending",
                requested_by=current_user.id or 0,
                user_id=current_user.id,
                module_name="Product",
                action_type="Create",
            )
        )
        await session.commit()
        return JSONResponse(
            {"pending": True, "status": "Pending", "message": "Submitted for Admin Approval"},
            status_code=202,
        )
    product = Product.model_validate(data)
    session.add(product)
    try:
        await session.flush()
        await _sync_variants(session, product, prepared)
        _record_audit(
            session,
            user_id=current_user.id,
            action_type="Created",
            entity_id=product.id,
            tenant_id=product.tenant_id,
            changes=_field_changes({}, _product_snapshot(product)),
            reason=x_audit_reason,
            method=x_audit_method,
        )
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create product",
        ) from None
    loaded = await _get_product(session, product.id or 0)
    return _to_read(loaded, default_vat, include_image=True)


@router.get("/", response_model=list[ProductRead])
async def list_products(
    tenant_id: Optional[int] = Query(None),
    branch_id: Optional[int] = Query(None),
    barcode: Optional[str] = Query(
        None,
        description="Exact match against the parent SKU, an additional barcode, or a variant SKU",
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    include_image: bool = Query(False),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ProductRead]:
    statement = restrict(select(Product).options(*_PRODUCT_LOAD), Product.tenant_id, current_user, tenant_id)
    if branch_id is not None:
        statement = statement.where(Product.branch_id == branch_id)
    result = await session.exec(statement.order_by(Product.created_at.desc()))
    rows = list(result.all())
    if barcode is not None and barcode.strip():
        rows = [product for product in rows if _matches_barcode(product, barcode)]
    page = rows[skip : skip + limit]
    default_vat = await get_default_vat(session)
    return [_to_read(product, default_vat, include_image) for product in page]


async def allocate_next_sku(session: AsyncSession) -> str:
    """Return the next unused numeric SKU."""
    used: set[str] = set()
    for barcode in (await session.exec(select(Product.barcode))).all():
        if isinstance(barcode, str) and barcode.strip():
            used.add(barcode.strip())
    for sku in (await session.exec(select(ProductVariant.sku))).all():
        if isinstance(sku, str) and sku.strip():
            used.add(sku.strip())
    numbers = [int(value) for value in used if value.isdigit()]
    candidate = max(numbers) + 1 if numbers else 10000001
    while str(candidate) in used:
        candidate += 1
    return str(candidate)


async def _item_code_taken(session: AsyncSession, item_code: str, exclude_id: Optional[int] = None) -> bool:
    statement = select(Product).where(Product.item_code == item_code)
    if exclude_id is not None:
        statement = statement.where(Product.id != exclude_id)
    return (await session.exec(statement)).first() is not None


def _claim_code(taken: set[str], code: str) -> Optional[str]:
    key = code.strip().lower()
    if not key or key in taken:
        return None
    taken.add(key)
    return code.strip()[:80]


def _is_admin_user(user: User) -> bool:
    return bypasses_maker_checker(user)


def _lookup_named(rows: list[Any], label: str) -> Any:
    wanted = label.strip()
    for row in rows:
        if str(getattr(row, "name", "")).strip() == wanted:
            return row
    matches = [row for row in rows if str(getattr(row, "name", "")).strip().lower() == wanted.lower()]
    return matches[0] if len(matches) == 1 else None


def _take_numeric_sku(taken: set[str]) -> str:
    numbers = [int(value) for value in taken if value.isdigit()]
    candidate = max(numbers) + 1 if numbers else 10000001
    while str(candidate) in taken:
        candidate += 1
    sku = str(candidate)
    taken.add(sku)
    return sku


def _next_variant_sku(base_sku: str, taken: set[str]) -> Optional[str]:
    for number in range(1, 10001):
        candidate = f"{base_sku}-{number:02d}"
        if candidate.lower() not in taken:
            taken.add(candidate.lower())
            return candidate
    return None


async def _load_bulk_catalog(session: AsyncSession, tenant_id: Optional[int] = None) -> dict[str, Any]:
    codes = list((await session.exec(select(CodeMaster).where(CodeMaster.tenant_id == tenant_id) if tenant_id else select(CodeMaster))).all())
    categories = list((await session.exec(select(CategoryMaster).where(CategoryMaster.tenant_id == tenant_id) if tenant_id else select(CategoryMaster))).all())
    sub_categories = list((await session.exec(select(SubCategoryMaster).where(SubCategoryMaster.tenant_id == tenant_id) if tenant_id else select(SubCategoryMaster))).all())
    brands = list((await session.exec(select(BrandMaster).where(BrandMaster.tenant_id == tenant_id) if tenant_id else select(BrandMaster))).all())
    vendors = list((await session.exec(select(VendorMaster).where(VendorMaster.tenant_id == tenant_id) if tenant_id else select(VendorMaster))).all())
    taken: set[str] = set()
    for barcode in (await session.exec(select(Product.barcode))).all():
        if isinstance(barcode, str) and barcode.strip():
            taken.add(barcode.strip().lower())
    for sku in (await session.exec(select(ProductVariant.sku))).all():
        if isinstance(sku, str) and sku.strip():
            taken.add(sku.strip().lower())
    item_codes: set[str] = set()
    for item_code in (await session.exec(select(Product.item_code))).all():
        if isinstance(item_code, str) and item_code.strip():
            item_codes.add(item_code.strip().lower())
    return {
        "codes": codes,
        "categories": {row.id: row for row in categories},
        "sub_categories": {row.id: row for row in sub_categories},
        "brands": brands,
        "vendors": vendors,
        "taken": taken,
        "item_codes": item_codes,
    }


def _match_code(codes: list[CodeMaster], code_number: str) -> Optional[CodeMaster]:
    wanted = code_number.strip()
    for row in codes:
        if row.code_number.strip() == wanted:
            return row
    matches = [row for row in codes if row.code_number.strip().lower() == wanted.lower()]
    return matches[0] if len(matches) == 1 else None


async def _insert_bulk_products(
    session: AsyncSession,
    payload: BulkImportRequest,
    current_user: User,
    *,
    strict: bool,
    stage: bool = True,
) -> tuple[BulkImportResult, list[BulkProductIn]]:
    """Validate against Code Master, assign SKUs, and stage products in this session."""
    payload.tenant_id = write_tenant(current_user, payload.tenant_id)
    await _validate_catalog_scope(session, payload.tenant_id, payload.branch_id)
    default_vat = await get_default_vat(session)
    catalog = await _load_bulk_catalog(session, payload.tenant_id)
    errors: list[BulkRowError] = []
    parents: list[Product] = []
    variant_plans: list[list[dict[str, Any]]] = []
    accepted: list[BulkProductIn] = []
    skipped = 0
    taken: set[str] = catalog["taken"]
    item_codes: set[str] = catalog["item_codes"]

    incoming = payload.products[:5000]
    if len(payload.products) > 5000:
        errors.append(BulkRowError(row=0, message="Only the first 5000 products are accepted."))

    grouped: dict[str, list[dict[str, Any]]] = {}
    group_order: list[str] = []
    for entry in incoming:
        row = entry.row or 0
        code_number = entry.code_number.strip()
        design_number = entry.design_number.strip()
        if not code_number or not design_number:
            errors.append(BulkRowError(row=row, message="Code number and design number are required."))
            skipped += 1
            continue
        if len(design_number) > 40:
            errors.append(BulkRowError(row=row, message="Design number is too long."))
            skipped += 1
            continue
        code = _match_code(catalog["codes"], code_number)
        if code is None:
            errors.append(BulkRowError(row=row, message=f"Code number {code_number} is not in Code Master."))
            skipped += 1
            continue
        category = catalog["categories"].get(code.category_id)
        sub_category = catalog["sub_categories"].get(code.sub_category_id)
        if category is None or sub_category is None:
            errors.append(BulkRowError(row=row, message=f"Code number {code_number} has no category."))
            skipped += 1
            continue
        item_code = f"{code.code_number.strip()}-{design_number}"
        if len(item_code) > 80:
            errors.append(BulkRowError(row=row, message="Item code is too long."))
            skipped += 1
            continue
        if any(value < 0 for value in (entry.purchase_price, entry.mrp, entry.wsp, entry.sale_vat, entry.price)):
            errors.append(BulkRowError(row=row, message="Prices and VAT cannot be negative."))
            skipped += 1
            continue
        brand = _lookup_named(catalog["brands"], entry.brand) if entry.brand.strip() else None
        if entry.brand.strip() and brand is None:
            errors.append(BulkRowError(row=row, message=f"Brand {entry.brand.strip()} is not in master data."))
            skipped += 1
            continue
        vendor = _lookup_named(catalog["vendors"], entry.vendor) if entry.vendor.strip() else None
        if entry.vendor.strip() and vendor is None:
            errors.append(BulkRowError(row=row, message=f"Vendor {entry.vendor.strip()} is not in master data."))
            skipped += 1
            continue
        if item_code not in grouped:
            group_order.append(item_code)
            grouped[item_code] = []
        grouped[item_code].append(
            {
                "entry": entry,
                "code": code,
                "category": category,
                "sub_category": sub_category,
                "brand": brand,
                "vendor": vendor,
                "design_number": design_number,
            }
        )

    for item_code in group_order:
        members = grouped[item_code]
        head = members[0]
        entry = head["entry"]
        row = entry.row or 0
        code = head["code"]
        category = head["category"]
        sub_category = head["sub_category"]
        brand = head["brand"]
        vendor = head["vendor"]
        design_number = head["design_number"]
        if item_code.lower() in item_codes:
            errors.append(BulkRowError(row=row, message=f"Item code {item_code} already exists."))
            skipped += len(members)
            continue

        variant_inputs: list[BulkVariantIn] = []
        if len(members) == 1:
            variant_inputs.extend(entry.variants)
        else:
            for member in members:
                source = member["entry"]
                if source.variants:
                    variant_inputs.extend(source.variants)
                else:
                    variant_inputs.append(BulkVariantIn(row=source.row, inherit_parent=True))

        barcode = _take_numeric_sku(taken) if stage else ""
        extras: list[str] = []
        extra_seen: set[str] = set()
        extra_failed = False
        for member in members:
            for raw_code in member["entry"].additional_barcodes:
                extra = raw_code.strip()[:80]
                if not extra or extra.lower() in extra_seen:
                    continue
                if barcode and extra.lower() == barcode.lower():
                    errors.append(BulkRowError(row=member["entry"].row or row, message=f"Additional barcode {extra} matches the generated SKU."))
                    extra_failed = True
                    break
                if _claim_code(taken, extra) is None:
                    errors.append(BulkRowError(row=member["entry"].row or row, message=f"Additional barcode {extra} already exists."))
                    extra_failed = True
                    break
                extra_seen.add(extra.lower())
                extras.append(extra)
            if extra_failed:
                break
        if extra_failed:
            if barcode:
                taken.discard(barcode.lower())
            for extra in extras:
                taken.discard(extra.lower())
            skipped += len(members)
            continue

        planned: list[dict[str, Any]] = []
        for variant in variant_inputs:
            if variant.mrp is not None and variant.mrp < 0:
                errors.append(BulkRowError(row=variant.row or row, message="Variant price cannot be negative."))
                skipped += 1
                continue
            attributes = {
                str(key).strip()[:80]: str(value).strip()[:80]
                for key, value in (variant.attributes or {}).items()
                if str(key).strip() and str(value).strip()
            }
            inherit = variant.inherit_parent and variant.mrp is None
            planned.append(
                {
                    "sku": _take_numeric_sku(taken) if stage else "",
                    "attributes": attributes,
                    "inherit_parent": inherit,
                    "stock_quantity": 0,
                    "price": None if inherit else variant.mrp,
                    "mrp": None if inherit else variant.mrp,
                    "purchase_price": None,
                    "wsp": None,
                    "image": None,
                    "vendor": None,
                    "custom_vat": False,
                    "sale_vat": None,
                }
            )

        item_codes.add(item_code.lower())
        merged = entry.model_copy(deep=True)
        merged.code_number = code.code_number.strip()
        merged.design_number = design_number
        merged.additional_barcodes = extras
        merged.variants = [
            variant
            for variant in variant_inputs
            if variant.mrp is None or variant.mrp >= 0
        ]
        accepted.append(merged)
        if not stage:
            if barcode:
                taken.discard(barcode.lower())
            for item in planned:
                if item["sku"]:
                    taken.discard(str(item["sku"]).lower())
            continue
        sale_vat = float(entry.sale_vat or 0) if entry.custom_vat else default_vat
        parents.append(
            Product(
                tenant_id=payload.tenant_id,
                branch_id=payload.branch_id,
                name=code.name.strip()[:255],
                barcode=barcode,
                additional_barcodes=extras,
                category=category.name[:120],
                sub_category=sub_category.name[:120],
                brand=(brand.name[:120] if brand is not None else ""),
                vendor=(vendor.name[:120] if vendor is not None else ""),
                design_code=item_code,
                design_number=design_number,
                item_code=item_code,
                code_id=code.id,
                category_id=category.id,
                sub_category_id=sub_category.id,
                brand_id=brand.id if brand is not None else None,
                vendor_id=vendor.id if vendor is not None else None,
                ec_product=entry.ec_product,
                purchase_price=float(entry.purchase_price or 0),
                mrp=float(entry.mrp or 0),
                price=float(entry.mrp or entry.price or 0),
                wsp=float(entry.wsp or 0),
                custom_vat=entry.custom_vat,
                sale_vat=sale_vat,
                stock_quantity=0,
                is_active=True,
            )
        )
        variant_plans.append(planned)

    if not stage or (strict and errors) or not parents:
        return (
            BulkImportResult(
                created=0,
                variants_created=0,
                skipped=skipped,
                queued=len(accepted),
                errors=errors,
            ),
            accepted,
        )

    variant_rows: list[ProductVariant] = []
    unique_parents: list[Product] = []
    unique_plans: list[list[dict[str, Any]]] = []
    seen_item_codes: set[str] = set()
    for parent, planned in zip(parents, variant_plans):
        key = (parent.item_code or "").strip().lower()
        if key in seen_item_codes:
            continue
        seen_item_codes.add(key)
        unique_parents.append(parent)
        unique_plans.append(planned)
    parents = unique_parents
    variant_plans = unique_plans
    session.add_all(parents)
    await session.flush()
    for parent, planned in zip(parents, variant_plans):
        variant_rows.extend(ProductVariant(product_id=parent.id, **item) for item in planned)
    if variant_rows:
        session.add_all(variant_rows)
    session.add(
        AuditLog(
            user_id=current_user.id,
            action_type="Created",
            entity_type="BulkImport",
            entity_id=None,
            changes={
                "products": {
                    "old": None,
                    "new": len(parents),
                }
            },
            reason=None,
            method="Bulk CSV Import",
        )
    )
    session.add_all(
        [
            AuditLog(
                user_id=current_user.id,
                action_type="Created",
                entity_type="Product",
                entity_id=parent.id,
                changes=_field_changes({}, _product_snapshot(parent)),
                reason=None,
                method="Bulk CSV Import",
            )
            for parent in parents
        ]
    )
    return (
        BulkImportResult(
            created=len(parents),
            variants_created=len(variant_rows),
            skipped=skipped,
            queued=len(accepted),
            errors=errors,
        ),
        accepted,
    )


async def apply_approved_product_bulk(
    session: AsyncSession,
    stored: dict[str, Any],
    current_user: User,
) -> BulkImportResult:
    """Insert a previously queued CSV batch. Caller commits."""
    raw_products = stored.get("products") if isinstance(stored, dict) else None
    products = [BulkProductIn.model_validate(item) for item in raw_products or [] if isinstance(item, dict)]
    branch_id = stored.get("branch_id")
    request = BulkImportRequest(
        tenant_id=int(stored.get("tenant_id") or 1),
        branch_id=int(branch_id) if branch_id is not None else None,
        products=products,
    )
    result, _accepted = await _insert_bulk_products(session, request, current_user, strict=True)
    if result.errors or result.created == 0:
        detail = result.errors[0].message if result.errors else "Nothing to import."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    return result


@router.post("/bulk", response_model=BulkImportResult)
async def bulk_create_products(
    payload: BulkImportRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> BulkImportResult:
    """Admins insert the batch. Other users queue one approval request."""
    try:
        if not _is_admin_user(current_user):
            preview, accepted = await _insert_bulk_products(session, payload, current_user, strict=False, stage=False)
            if not accepted:
                return preview
            request = ApprovalRequest(
                tenant_id=payload.tenant_id,
                entity_type="product_bulk",
                action="create",
                user_id=current_user.id,
                module_name="Product",
                action_type="Create",
                payload={
                    "name": f"Bulk import ({len(accepted)} products)",
                    "summary": f"{len(accepted)} products",
                    "tenant_id": payload.tenant_id,
                    "branch_id": payload.branch_id,
                    "products": [item.model_dump() for item in accepted],
                },
                status="Pending",
                requested_by=current_user.id or 0,
            )
            session.add(request)
            await session.commit()
            await session.refresh(request)
            return BulkImportResult(
                created=0,
                variants_created=0,
                skipped=preview.skipped,
                queued=len(accepted),
                pending_approval=True,
                errors=preview.errors,
            )

        result, _accepted = await _insert_bulk_products(session, payload, current_user, strict=False)
        if result.created == 0:
            await session.rollback()
            return result
        await session.commit()
        return result
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not import products. Check for duplicate item codes and try again.",
        ) from None


class ProductTablePage(SQLModel):
    items: list[ProductRead]
    total: int
    page: int
    page_size: int
    pages: int
    categories: list[str] = []


class AuditEntryRead(SQLModel):
    id: int
    user_id: Optional[int] = None
    user_name: str = ""
    action_type: str
    entity_type: str
    entity_id: Optional[int] = None
    changes: dict[str, Any] = {}
    reason: Optional[str] = None
    method: str
    created_at: datetime


def _product_filters(
    q: Optional[str],
    status_value: Optional[str],
    category: Optional[str],
) -> list[Any]:
    filters: list[Any] = []
    if q and q.strip():
        term = f"%{q.strip()}%"
        filters.append(
            or_(
                Product.name.ilike(term),
                Product.item_code.ilike(term),
                Product.barcode.ilike(term),
                Product.design_code.ilike(term),
            )
        )
    if status_value == "active":
        filters.append(Product.is_active.is_(True))
    elif status_value == "inactive":
        filters.append(Product.is_active.is_(False))
    if category and category.strip():
        filters.append(Product.category == category.strip())
    return filters


@router.get("/table", response_model=ProductTablePage)
async def product_table(
    q: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = Query(None),
    tenant_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ProductTablePage:
    filters = _product_filters(q, status_filter, category)
    scoped_tenant = read_scope(current_user, tenant_id)
    if scoped_tenant is not None:
        filters.append(Product.tenant_id == scoped_tenant)
    total = (await session.exec(select(func.count(Product.id)).where(*filters))).one()
    total_count = int(total or 0)
    pages = max(1, (total_count + page_size - 1) // page_size)
    safe_page = min(page, pages)
    rows = (
        await session.exec(
            select(Product)
            .where(*filters)
            .options(*_PRODUCT_LOAD)
            .order_by(Product.created_at.desc(), Product.id.desc())
            .offset((safe_page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    default_vat = await get_default_vat(session)
    category_statement = select(Product.category).distinct()
    if scoped_tenant is not None:
        category_statement = category_statement.where(Product.tenant_id == scoped_tenant)
    category_rows = (await session.exec(category_statement)).all()
    categories = sorted({name.strip() for name in category_rows if isinstance(name, str) and name.strip()})
    return ProductTablePage(
        items=[_to_read(product, default_vat, include_image=False) for product in rows],
        total=total_count,
        page=safe_page,
        page_size=page_size,
        pages=pages,
        categories=categories,
    )


@router.get("/{product_id}/history", response_model=list[AuditEntryRead])
async def product_history(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[AuditEntryRead]:
    await _get_product(session, product_id, current_user)
    logs = (
        await session.exec(
            select(AuditLog)
            .where(AuditLog.entity_type == "Product", AuditLog.entity_id == product_id)
            .order_by(AuditLog.created_at.desc())
        )
    ).all()
    user_ids = {log.user_id for log in logs if log.user_id is not None}
    names: dict[int, str] = {}
    if user_ids:
        users = (await session.exec(select(User).where(col(User.id).in_(user_ids)))).all()
        names = {user.id or 0: user.name for user in users}
    return [
        AuditEntryRead(
            id=log.id or 0,
            user_id=log.user_id,
            user_name=names.get(log.user_id or 0, "Unknown user"),
            action_type=log.action_type,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            changes=log.changes or {},
            reason=log.reason,
            method=log.method,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get("/next-sku")
async def read_next_sku(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    return {"sku": await allocate_next_sku(session)}


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ProductRead:
    product = await _get_product(session, product_id, current_user)
    return _to_read(product, await get_default_vat(session), include_image=True)


@router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    x_audit_method: str = Header(default="Web UI"),
    x_audit_reason: Optional[str] = Header(default=None),
) -> ProductRead:
    product = await _get_product(session, product_id, current_user)
    before = _product_snapshot(product)
    data = payload.model_dump(exclude_unset=True)
    data.pop("variants", None)
    next_tenant_id = data.get("tenant_id", product.tenant_id)
    next_branch_id = data.get("branch_id", product.branch_id)
    next_barcode = data.get("barcode", product.barcode)
    raw_extras = data.get("additional_barcodes", product.additional_barcodes)
    next_extras = _clean_additional_barcodes(raw_extras or [], next_barcode)
    data["additional_barcodes"] = next_extras
    if "image" in data:
        data["image"] = _clean_image(data.get("image"))
    if "variations" in data:
        data["variations"] = _clean_variations(data.get("variations"))
    default_vat = await get_default_vat(session)
    if data.get("custom_vat") is False:
        data["sale_vat"] = default_vat
    if "item_code" in data:
        item_code = str(data.get("item_code") or "").strip()
        if not item_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item code is required.")
        if await _item_code_taken(session, item_code, exclude_id=product.id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item code already exists.")
        data["item_code"] = item_code
        data["design_code"] = item_code
    data.pop("barcode", None)
    await _validate_catalog_scope(session, next_tenant_id, next_branch_id)
    await _assert_codes_available(session, next_barcode, next_extras, exclude_id=product.id)
    prepared = None
    if payload.variants is not None or payload.variations is not None:
        prepared = _variants_from_payload(
            payload.variants,
            payload.variations if payload.variations is not None else product.variations,
            next_barcode,
        )
        await _assert_variant_skus(session, [item["sku"] for item in prepared], product.id)
    data["tenant_id"] = write_tenant(current_user, data.get("tenant_id", product.tenant_id))
    if not _is_admin_user(current_user):
        session.add(
            ApprovalRequest(
                tenant_id=product.tenant_id,
                entity_type="product",
                action="update",
                entity_id=product.id,
                payload={**data, "variants": prepared},
                status="Pending",
                requested_by=current_user.id or 0,
                user_id=current_user.id,
                module_name="Product",
                action_type="Update",
            )
        )
        await session.commit()
        return JSONResponse(
            {"pending": True, "status": "Pending", "message": "Submitted for Admin Approval"},
            status_code=202,
        )
    product.sqlmodel_update(data)
    session.add(product)
    try:
        if prepared is not None:
            await session.flush()
            await _sync_variants(session, product, prepared)
        _record_audit(
            session,
            user_id=current_user.id,
            action_type="Updated",
            entity_id=product.id,
            changes=_field_changes(before, _product_snapshot(product)),
            reason=x_audit_reason,
            method=x_audit_method,
        )
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not update product",
        ) from None
    loaded = await _get_product(session, product_id)
    return _to_read(loaded, default_vat, include_image=True)


class ProductFlagWrite(SQLModel):
    is_active: Optional[bool] = None
    is_hidden: Optional[bool] = None


def _queue_product_change(session: AsyncSession, user: User, product: Product, action: str, payload: dict[str, Any]) -> None:
    session.add(
        ApprovalRequest(
            tenant_id=product.tenant_id,
            entity_type="product",
            action=action,
            entity_id=product.id,
            payload=payload,
            status="Pending",
            requested_by=user.id or 0,
            user_id=user.id,
            module_name="Product",
            action_type={"update": "Update", "delete": "Delete"}.get(action, action.title()),
        )
    )


async def apply_approved_product_change(
    session: AsyncSession,
    action: str,
    entity_id: int,
    payload: dict[str, Any],
    current_user: User,
) -> None:
    """Apply an approved product change. Caller commits."""
    payload = dict(payload)
    if action == "create":
        variants = list(payload.pop("variants", []) or [])
        created = Product.model_validate(payload)
        session.add(created)
        await session.flush()
        if variants:
            await _sync_variants(session, created, variants)
        _record_audit(
            session,
            user_id=current_user.id,
            action_type="Created",
            entity_id=created.id,
            tenant_id=created.tenant_id,
            changes=_field_changes({}, _product_snapshot(created)),
            reason=None,
            method="Web UI",
        )
        return
    product = await _get_product(session, entity_id)
    if action == "update" and not set(payload.keys()) <= {"is_active", "is_hidden"}:
        before = _product_snapshot(product)
        variants = payload.pop("variants", None)
        payload.pop("barcode", None)
        product.sqlmodel_update(payload)
        session.add(product)
        await session.flush()
        if isinstance(variants, list):
            await _sync_variants(session, product, variants)
        _record_audit(
            session,
            user_id=current_user.id,
            action_type="Updated",
            entity_id=product.id,
            tenant_id=product.tenant_id,
            changes=_field_changes(before, _product_snapshot(product)),
            reason=None,
            method="Web UI",
        )
        return
    if action == "delete":
        before = _product_snapshot(product)
        _record_audit(
            session,
            user_id=current_user.id,
            action_type="Deleted",
            entity_id=product.id,
            changes=_field_changes(before, {}),
            reason=None,
            method="Web UI",
        )
        await session.delete(product)
        return
    before = _product_snapshot(product)
    if "is_active" in payload and payload["is_active"] is not None:
        product.is_active = bool(payload["is_active"])
    if "is_hidden" in payload and payload["is_hidden"] is not None:
        product.is_hidden = bool(payload["is_hidden"])
    session.add(product)
    _record_audit(
        session,
        user_id=current_user.id,
        action_type="Updated",
        entity_id=product.id,
        changes=_field_changes(before, _product_snapshot(product)),
        reason=None,
        method="Web UI",
    )


@router.patch("/{product_id}/flags")
async def update_product_flags(
    product_id: int,
    payload: ProductFlagWrite,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update.")
    product = await _get_product(session, product_id, current_user)
    if not _is_admin_user(current_user):
        _queue_product_change(session, current_user, product, "update", changes)
        await session.commit()
        return {"pending": True, "status": "Pending", "message": "Submitted for Admin Approval"}
    await apply_approved_product_change(session, "update", product_id, changes, current_user)
    await session.commit()
    return {"pending": False, "status": "Approved"}


@router.delete("/{product_id}")
async def delete_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    x_audit_method: str = Header(default="Web UI"),
    x_audit_reason: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    product = await _get_product(session, product_id, current_user)
    if not _is_admin_user(current_user):
        _queue_product_change(session, current_user, product, "delete", {"name": product.name, "item_code": product.item_code})
        await session.commit()
        return {"pending": True, "status": "Pending", "message": "Submitted for Admin Approval"}
    before = _product_snapshot(product)
    _record_audit(
        session,
        user_id=current_user.id,
        action_type="Deleted",
        entity_id=product.id,
        changes=_field_changes(before, {}),
        reason=x_audit_reason,
        method=x_audit_method,
    )
    await session.delete(product)
    await session.commit()
    return {"pending": False, "status": "Approved"}
