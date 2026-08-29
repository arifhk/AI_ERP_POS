import hashlib
import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from database import get_session
from models import Branch, Tenant, User, UserRole

router = APIRouter()

_HASH_ITERS = 120_000


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _HASH_ITERS,
    )
    return f"pbkdf2_sha256${_HASH_ITERS}${salt}${derived.hex()}"


class UserCreate(SQLModel):
    email: str
    full_name: str
    password: str
    role: UserRole = UserRole.CASHIER
    tenant_id: Optional[int] = None
    branch_id: Optional[int] = None
    is_active: bool = True


class UserUpdate(SQLModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    tenant_id: Optional[int] = None
    branch_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserRead(SQLModel):
    id: int
    email: str
    full_name: str
    role: UserRole
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
    role: UserRole,
) -> None:
    if role != UserRole.SUPER_ADMIN and tenant_id is None:
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
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=_hash_password(payload.password),
        role=payload.role,
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
        user.hashed_password = _hash_password(password)
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
