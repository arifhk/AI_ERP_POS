from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user
from database import get_session
from models import Tenant, User
from rbac import require_super_admin

router = APIRouter()


class TenantCreate(SQLModel):
    name: str
    slug: str
    domain: Optional[str] = None
    subdomain: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str = "active"
    is_active: bool = True


class TenantUpdate(SQLModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class TenantRead(SQLModel):
    id: int
    name: str
    slug: str
    domain: Optional[str] = None
    subdomain: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str = "active"
    is_active: bool
    created_at: datetime


async def _get_tenant(session: AsyncSession, tenant_id: int) -> Tenant:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


@router.post("/", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    payload: TenantCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Tenant:
    require_super_admin(current_user)
    tenant = Tenant.model_validate(payload)
    session.add(tenant)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant slug already exists",
        ) from None
    await session.refresh(tenant)
    return tenant


@router.get("/", response_model=list[TenantRead])
async def list_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[Tenant]:
    require_super_admin(current_user)
    result = await session.exec(select(Tenant).offset(skip).limit(limit).order_by(Tenant.id))
    return list(result.all())


@router.get("/{tenant_id}", response_model=TenantRead)
async def get_tenant(
    tenant_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Tenant:
    require_super_admin(current_user)
    return await _get_tenant(session, tenant_id)


@router.patch("/{tenant_id}", response_model=TenantRead)
async def update_tenant(
    tenant_id: int,
    payload: TenantUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Tenant:
    require_super_admin(current_user)
    tenant = await _get_tenant(session, tenant_id)
    data = payload.model_dump(exclude_unset=True)
    tenant.sqlmodel_update(data)
    session.add(tenant)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant slug already exists",
        ) from None
    await session.refresh(tenant)
    return tenant


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant(
    tenant_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    require_super_admin(current_user)
    tenant = await _get_tenant(session, tenant_id)
    await session.delete(tenant)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete tenant while related branches, users, or products exist",
        ) from None
