"""System Owner controls: every user, role changes, password overrides, ownership transfer."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user, hash_password, verify_password
from database import get_session
from models import AuditLog, Tenant, User, UserRole
from rbac import assert_role_assignment, normalize_role, require_system_owner

router = APIRouter()

ROLE_LABELS = {
    UserRole.SYSTEM_OWNER.value,
    UserRole.SUPER_ADMIN.value,
    UserRole.TENANT_ADMIN.value,
    UserRole.TENANT_USER.value,
}


class RoleChange(SQLModel):
    role: str
    tenant_id: Optional[int] = None


class PasswordOverride(SQLModel):
    password: str


class OwnershipTransfer(SQLModel):
    target_user_id: int
    current_password: str
    demote_self: bool = True


class ManagedUser(SQLModel):
    id: int
    name: str
    email: str
    role: str
    tenant_id: Optional[int] = None
    tenant_name: str = ""
    branch_id: Optional[int] = None
    is_active: bool


def _audit(session: AsyncSession, actor: User, action: str, entity_id: Optional[int], changes: dict, reason: str) -> None:
    session.add(
        AuditLog(
            tenant_id=None,
            user_id=actor.id,
            action_type=action,
            entity_type="User",
            entity_id=entity_id,
            changes=changes,
            reason=reason[:500],
            method="System Owner",
        )
    )


@router.get("/users", response_model=list[ManagedUser])
async def list_all_users(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ManagedUser]:
    require_system_owner(current_user)
    users = list((await session.exec(select(User).order_by(User.id))).all())
    tenants = {row.id: row.name for row in (await session.exec(select(Tenant))).all()}
    return [
        ManagedUser(
            id=user.id or 0,
            name=user.name,
            email=user.email,
            role=normalize_role(user.role),
            tenant_id=user.tenant_id,
            tenant_name=tenants.get(user.tenant_id or 0, "Platform") if user.tenant_id else "Platform",
            branch_id=user.branch_id,
            is_active=user.is_active,
        )
        for user in users
    ]


@router.patch("/users/{user_id}/role", response_model=ManagedUser)
async def change_user_role(
    user_id: int,
    payload: RoleChange,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ManagedUser:
    require_system_owner(current_user)
    role = normalize_role(payload.role)
    if role not in ROLE_LABELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown role.")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == current_user.id and role != UserRole.SYSTEM_OWNER.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use Transfer Ownership to give up System Owner.")
    assert_role_assignment(current_user, role, existing=user)
    previous = normalize_role(user.role)
    user.role = role
    if role in {UserRole.SYSTEM_OWNER.value, UserRole.SUPER_ADMIN.value}:
        user.tenant_id = None
    elif payload.tenant_id is not None:
        tenant = await session.get(Tenant, payload.tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
        user.tenant_id = payload.tenant_id
    elif user.tenant_id is None:
        user.tenant_id = 1
    _audit(
        session,
        current_user,
        "Role Changed",
        user.id,
        {"role": {"old": previous, "new": role}},
        f"System Owner changed {user.email} from {previous} to {role}.",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    tenant_name = "Platform"
    if user.tenant_id is not None:
        tenant = await session.get(Tenant, user.tenant_id)
        tenant_name = tenant.name if tenant is not None else ""
    return ManagedUser(
        id=user.id or 0,
        name=user.name,
        email=user.email,
        role=normalize_role(user.role),
        tenant_id=user.tenant_id,
        tenant_name=tenant_name,
        branch_id=user.branch_id,
        is_active=user.is_active,
    )


@router.post("/users/{user_id}/password")
async def override_password(
    user_id: int,
    payload: PasswordOverride,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    require_system_owner(current_user)
    password = payload.password.strip()
    if len(password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters.")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.hashed_password = hash_password(password)
    _audit(
        session,
        current_user,
        "Password Override",
        user.id,
        {"password": {"old": "hidden", "new": "reset"}},
        f"System Owner set a new password for {user.email}.",
    )
    session.add(user)
    await session.commit()
    return {"message": "Password updated."}


@router.post("/ownership/transfer")
async def transfer_ownership(
    payload: OwnershipTransfer,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    require_system_owner(current_user)
    if not current_user.hashed_password or not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect.")
    if payload.target_user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different user.")
    target = await session.get(User, payload.target_user_id)
    if target is None or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active user not found.")

    previous_role = normalize_role(target.role)
    target.role = UserRole.SYSTEM_OWNER.value
    target.tenant_id = None
    session.add(target)
    owner_next = UserRole.SYSTEM_OWNER.value
    if payload.demote_self:
        current_user.role = UserRole.SUPER_ADMIN.value
        current_user.tenant_id = None
        owner_next = UserRole.SUPER_ADMIN.value
        session.add(current_user)

    _audit(
        session,
        current_user,
        "Ownership Transfer",
        target.id,
        {
            "target_role": {"old": previous_role, "new": UserRole.SYSTEM_OWNER.value},
            "actor_role": {"old": UserRole.SYSTEM_OWNER.value, "new": owner_next},
            "target_email": {"old": "", "new": target.email},
        },
        f"Ownership transferred to {target.email}. Actor remains {owner_next}.",
    )
    await session.commit()
    return {
        "message": "Ownership transferred.",
        "actor_role": owner_next,
    }
