"""Relational SQLModel tables for multi-tenant ERP / POS."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, Enum):
    """Platform and tenant roles for RBAC."""

    SUPER_ADMIN = "super_admin"  # SaaS operator; tenant_id may be null
    TENANT_ADMIN = "tenant_admin"
    MANAGER = "manager"
    CASHIER = "cashier"
    INVENTORY = "inventory"


class Tenant(SQLModel, table=True):
    """Company / organization that owns branches, users, and catalog."""

    __tablename__ = "tenants"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, max_length=255)
    slug: str = Field(unique=True, index=True, max_length=80)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)

    branches: list["Branch"] = Relationship(back_populates="tenant")
    users: list["User"] = Relationship(back_populates="tenant")
    products: list["Product"] = Relationship(back_populates="tenant")
    orders: list["Order"] = Relationship(back_populates="tenant")


class Branch(SQLModel, table=True):
    """Physical or logical store belonging to a tenant."""

    __tablename__ = "branches"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    name: str = Field(max_length=255)
    code: str = Field(index=True, max_length=40)
    address: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=50)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)

    tenant: Tenant = Relationship(back_populates="branches")
    users: list["User"] = Relationship(back_populates="branch")
    products: list["Product"] = Relationship(back_populates="branch")
    orders: list["Order"] = Relationship(back_populates="branch")


class User(SQLModel, table=True):
    """Staff account scoped to a tenant, optionally pinned to a branch."""

    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    branch_id: Optional[int] = Field(default=None, foreign_key="branches.id", index=True)
    email: str = Field(unique=True, index=True, max_length=255)
    name: str = Field(max_length=255)
    hashed_password: str = Field(max_length=255)
    role: str = Field(default="Cashier", index=True, max_length=50)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)

    tenant: Optional[Tenant] = Relationship(back_populates="users")
    branch: Optional[Branch] = Relationship(back_populates="users")


class Product(SQLModel, table=True):
    """Catalog item owned by a tenant; optional branch for store-specific stock."""

    __tablename__ = "products"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    branch_id: Optional[int] = Field(default=None, foreign_key="branches.id", index=True)
    name: str = Field(max_length=255)
    barcode: str = Field(unique=True, index=True, max_length=80)
    price: float = Field(ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)

    tenant: Tenant = Relationship(back_populates="products")
    branch: Optional[Branch] = Relationship(back_populates="products")
    order_items: list["OrderItem"] = Relationship(back_populates="product")


class Order(SQLModel, table=True):
    """POS sale header scoped to a tenant branch."""

    __tablename__ = "orders"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    branch_id: int = Field(foreign_key="branches.id", index=True)
    total_amount: float = Field(ge=0)
    created_at: datetime = Field(default_factory=utcnow)

    tenant: Tenant = Relationship(back_populates="orders")
    branch: Branch = Relationship(back_populates="orders")
    items: list["OrderItem"] = Relationship(back_populates="order")


class OrderItem(SQLModel, table=True):
    """Line item on a POS order, with unit price at time of sale."""

    __tablename__ = "order_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: int = Field(foreign_key="orders.id", index=True)
    product_id: int = Field(foreign_key="products.id", index=True)
    quantity: int = Field(ge=1)
    price: float = Field(ge=0)

    order: Order = Relationship(back_populates="items")
    product: Product = Relationship(back_populates="order_items")
