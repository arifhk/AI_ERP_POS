import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import hash_password
from database import get_session
from models import Branch, Tenant, User, UserRole

router = APIRouter()


class UserCreate(SQLModel):
    name: str
    email: str
    role: str = "Cashier"
    branch_id: Optional[int] = None
    tenant_id: Optional[int] = 1
    password: Optional[str] = None
    is_active: bool = True


class UserUpdate(SQLModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    tenant_id: Optional[int] = None
    branch_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserRead(SQLModel):
    id: int
    name: str
    email: str
    role: str
    tenant_id: Optional[int] = None
    branch_id: Optional[int] = None
    is_active: bool
    created_at: datetime


async def _get_user(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def _validate_scope(
    session: AsyncSession,
    tenant_id: Optional[int],
    branch_id: Optional[int],
    role: str,
) -> None:
    normalized_role = role.strip().lower().replace(" ", "_")
    if normalized_role != UserRole.SUPER_ADMIN.value and tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tenant_id is required unless role is super_admin",
        )
    if tenant_id is not None:
        tenant = await session.get(Tenant, tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if branch_id is not None:
        branch = await session.get(Branch, branch_id)
        if branch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
        if tenant_id is not None and branch.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch does not belong to the given tenant",
            )


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    session: AsyncSession = Depends(get_session),
) -> User:
    await _validate_scope(session, payload.tenant_id, payload.branch_id, payload.role)
    user = User(
        email=payload.email.strip(),
        name=payload.name.strip(),
        hashed_password=hash_password(payload.password or secrets.token_urlsafe(12)),
        role=payload.role.strip() or "Cashier",
        tenant_id=payload.tenant_id,
        branch_id=payload.branch_id,
        is_active=payload.is_active,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already exists",
        ) from None
    await session.refresh(user)
    return user


@router.get("/", response_model=list[UserRead])
async def list_users(
    tenant_id: Optional[int] = Query(None),
    branch_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> list[User]:
    statement = select(User)
    if tenant_id is not None:
        statement = statement.where(User.tenant_id == tenant_id)
    if branch_id is not None:
        statement = statement.where(User.branch_id == branch_id)
    result = await session.exec(statement.offset(skip).limit(limit).order_by(User.id))
    return list(result.all())


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
) -> User:
    return await _get_user(session, user_id)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await _get_user(session, user_id)
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    next_tenant_id = data.get("tenant_id", user.tenant_id)
    next_branch_id = data.get("branch_id", user.branch_id)
    next_role = data.get("role", user.role)
    await _validate_scope(session, next_tenant_id, next_branch_id, next_role)
    user.sqlmodel_update(data)
    if password is not None:
        user.hashed_password = hash_password(password)
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already exists",
        ) from None
    await session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    user = await _get_user(session, user_id)
    await session.delete(user)
    await session.commit()
