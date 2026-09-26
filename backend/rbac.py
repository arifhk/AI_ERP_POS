"""Role checks and tenant isolation for the SaaS control plane.

Hierarchy: SYSTEM_OWNER > SUPER_ADMIN > TENANT_ADMIN > TENANT_USER.
"""

from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import SQLModel

from models import User, UserRole

_SYSTEM_OWNER = {
    UserRole.SYSTEM_OWNER.value,
    "systemowner",
    "root",
    "god",
    "owner",
}
_SUPER = {
    UserRole.SUPER_ADMIN.value,
    "superadmin",
}
_TENANT_ADMIN = {
    UserRole.TENANT_ADMIN.value,
    "admin",
    "tenantadmin",
}
_TENANT_USER = {
    UserRole.TENANT_USER.value,
    "cashier",
    "manager",
    "inventory",
    "user",
    "pending",
}
_PRIVILEGED = {UserRole.SYSTEM_OWNER.value, UserRole.SUPER_ADMIN.value}


def normalize_role(role: Optional[str]) -> str:
    value = (role or "").strip().lower().replace(" ", "_").replace("-", "_")
    if value in _SYSTEM_OWNER:
        return UserRole.SYSTEM_OWNER.value
    if value in _SUPER:
        return UserRole.SUPER_ADMIN.value
    if value in _TENANT_ADMIN:
        return UserRole.TENANT_ADMIN.value
    if value in _TENANT_USER:
        return UserRole.TENANT_USER.value
    return value


def is_system_owner(user: User) -> bool:
    return normalize_role(user.role) == UserRole.SYSTEM_OWNER.value


def is_super_admin(user: User) -> bool:
    return normalize_role(user.role) == UserRole.SUPER_ADMIN.value


def is_platform_admin(user: User) -> bool:
    """System Owner and Super Admin operate across every tenant."""
    return is_system_owner(user) or is_super_admin(user)


def is_tenant_admin(user: User) -> bool:
    return normalize_role(user.role) == UserRole.TENANT_ADMIN.value


def is_tenant_user(user: User) -> bool:
    return normalize_role(user.role) == UserRole.TENANT_USER.value


def bypasses_maker_checker(user: User) -> bool:
    """Platform roles and Tenant Admin write immediately. Tenant users queue changes."""
    return is_platform_admin(user) or is_tenant_admin(user)


def require_platform_admin(user: User) -> None:
    if not is_platform_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin access required.")


def require_super_admin(user: User) -> None:
    """Tenant directory and other cross-tenant tools. System Owner is included."""
    require_platform_admin(user)


def require_system_owner(user: User) -> None:
    if not is_system_owner(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System Owner access required.")


def require_tenant_manager(user: User) -> None:
    """User administration and approval rights inside the caller's scope."""
    if not bypasses_maker_checker(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant Admin access required.")


def assert_role_assignment(actor: User, target_role: str, existing: Optional[User] = None) -> None:
    """Only a System Owner may create, edit, or demote a System Owner or Super Admin."""
    if existing is not None and normalize_role(existing.role) in _PRIVILEGED and not is_system_owner(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a System Owner can manage a System Owner or Super Admin.",
        )
    if normalize_role(target_role) in _PRIVILEGED and not is_system_owner(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a System Owner can assign System Owner or Super Admin.",
        )


def read_scope(user: User, requested: Optional[int]) -> Optional[int]:
    """Return the tenant to filter on. None means every tenant (platform admins only)."""
    if is_platform_admin(user):
        return requested
    if user.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is not assigned to a business.")
    if requested is not None and requested != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot view another business.")
    return user.tenant_id


def write_tenant(user: User, requested: Optional[int]) -> int:
    """Tenant stamped onto new rows. Platform admins default to the requested business or tenant 1."""
    if is_platform_admin(user):
        return int(requested or user.tenant_id or 1)
    if user.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is not assigned to a business.")
    if requested is not None and int(requested) != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot change another business.")
    return int(user.tenant_id)


def assert_tenant_access(user: User, tenant_id: Optional[int]) -> None:
    if is_platform_admin(user):
        return
    if user.tenant_id is None or tenant_id != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found.")


def restrict(statement, column, user: User, requested: Optional[int] = None):
    scope = read_scope(user, requested)
    if scope is None:
        return statement
    return statement.where(column == scope)


def same_tenant(left: Optional[SQLModel], right_tenant_id: Optional[int]) -> bool:
    return getattr(left, "tenant_id", None) == right_tenant_id
