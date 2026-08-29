from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from database import get_session
from models import Branch, Tenant

router = APIRouter()


class BranchCreate(SQLModel):
    tenant_id: int
    name: str
    code: str
    address: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True


class BranchUpdate(SQLModel):
    tenant_id: Optional[int] = None
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class BranchRead(SQLModel):
    id: int
    tenant_id: int
    name: str
    code: str
    address: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    created_at: datetime


async def _get_branch(session: AsyncSession, branch_id: int) -> Branch:
    branch = await session.get(Branch, branch_id)
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    return branch


async def _require_tenant(session: AsyncSession, tenant_id: int) -> None:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")


async def _code_taken(
    session: AsyncSession,
    tenant_id: int,
    code: str,
    exclude_id: Optional[int] = None,
) -> bool:
    statement = select(Branch).where(Branch.tenant_id == tenant_id, Branch.code == code)
    if exclude_id is not None:
        statement = statement.where(Branch.id != exclude_id)
    existing = (await session.exec(statement)).first()
    return existing is not None


@router.post("/", response_model=BranchRead, status_code=status.HTTP_201_CREATED)
async def create_branch(
    payload: BranchCreate,
    session: AsyncSession = Depends(get_session),
) -> Branch:
    await _require_tenant(session, payload.tenant_id)
    if await _code_taken(session, payload.tenant_id, payload.code):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Branch code already exists for this tenant",
        )
    branch = Branch.model_validate(payload)
    session.add(branch)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create branch",
        ) from None
    await session.refresh(branch)
    return branch


@router.get("/", response_model=list[BranchRead])
async def list_branches(
    tenant_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> list[Branch]:
    statement = select(Branch)
    if tenant_id is not None:
        statement = statement.where(Branch.tenant_id == tenant_id)
    result = await session.exec(statement.offset(skip).limit(limit).order_by(Branch.id))
    return list(result.all())


@router.get("/{branch_id}", response_model=BranchRead)
async def get_branch(
    branch_id: int,
    session: AsyncSession = Depends(get_session),
) -> Branch:
    return await _get_branch(session, branch_id)


@router.patch("/{branch_id}", response_model=BranchRead)
async def update_branch(
    branch_id: int,
    payload: BranchUpdate,
    session: AsyncSession = Depends(get_session),
) -> Branch:
    branch = await _get_branch(session, branch_id)
    data = payload.model_dump(exclude_unset=True)
    next_tenant_id = data.get("tenant_id", branch.tenant_id)
    next_code = data.get("code", branch.code)
    if "tenant_id" in data:
        await _require_tenant(session, data["tenant_id"])
    if await _code_taken(session, next_tenant_id, next_code, exclude_id=branch.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Branch code already exists for this tenant",
        )
    branch.sqlmodel_update(data)
    session.add(branch)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not update branch",
        ) from None
    await session.refresh(branch)
    return branch


@router.delete("/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_branch(
    branch_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    branch = await _get_branch(session, branch_id)
    await session.delete(branch)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete branch while related users or products exist",
        ) from None
