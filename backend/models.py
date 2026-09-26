"""Relational SQLModel tables for multi-tenant ERP / POS."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, Relationship, SQLModel

# Declarative base for Alembic. Table classes below register on this metadata.
Base = SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_iso_datetime(value: Optional[str], *, is_end: bool = False) -> Optional[datetime]:
    """Parse an optional ISO-8601 query value into a UTC-naive datetime."""
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError("Invalid date format. Use ISO 8601.") from exc

    if parsed.tzinfo is None:
        if "T" not in raw and " " not in raw:
            if is_end:
                parsed = parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


class UserRole(str, Enum):
    """Platform and tenant roles. Higher roles outrank the ones below."""

    SYSTEM_OWNER = "system_owner"  # Root. Only this role can grant System Owner or Super Admin.
    SUPER_ADMIN = "super_admin"  # All tenants. Cannot manage System Owners or other Super Admins.
    TENANT_ADMIN = "tenant_admin"  # One business. Approves that tenant's queue.
    TENANT_USER = "tenant_user"  # One business. Every write waits for approval.


class Tenant(SQLModel, table=True):
    """Company / organization that owns branches, users, and catalog."""

    __tablename__ = "tenants"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, max_length=255)
    slug: str = Field(unique=True, index=True, max_length=80)
    domain: Optional[str] = Field(default=None, unique=True, index=True, max_length=255)
    subdomain: Optional[str] = Field(default=None, unique=True, index=True, max_length=80)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    status: str = Field(default="active", index=True, max_length=20)
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
    hashed_password: Optional[str] = Field(default=None, max_length=255)
    role: str = Field(default="Pending", index=True, max_length=50)
    is_active: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)

    tenant: Optional[Tenant] = Relationship(back_populates="users")
    branch: Optional[Branch] = Relationship(back_populates="users")


class PasswordResetToken(SQLModel, table=True):
    """One-time secret for account recovery. The stored token is a hash."""

    __tablename__ = "password_reset_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    token: str = Field(unique=True, index=True, max_length=64)
    user_id: int = Field(foreign_key="users.id", index=True)
    expires_at: datetime
    used_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class Product(SQLModel, table=True):
    """Catalog item owned by a tenant; optional branch for store-specific stock."""

    __tablename__ = "products"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    branch_id: Optional[int] = Field(default=None, foreign_key="branches.id", index=True)
    name: str = Field(max_length=255)
    barcode: str = Field(unique=True, index=True, max_length=80)
    additional_barcodes: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    image: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    category: str = Field(default="", max_length=120)
    sub_category: str = Field(default="", max_length=120)
    brand: str = Field(default="", max_length=120)
    vendor: str = Field(default="", max_length=120)
    design_code: str = Field(default="", max_length=80)
    design_number: str = Field(default="", max_length=40)
    item_code: Optional[str] = Field(default=None, unique=True, index=True, max_length=80)
    code_id: Optional[int] = Field(default=None, foreign_key="code_masters.id", index=True)
    category_id: Optional[int] = Field(default=None, foreign_key="category_masters.id", index=True)
    sub_category_id: Optional[int] = Field(default=None, foreign_key="sub_category_masters.id", index=True)
    brand_id: Optional[int] = Field(default=None, foreign_key="brand_masters.id", index=True)
    vendor_id: Optional[int] = Field(default=None, foreign_key="vendor_masters.id", index=True)
    ec_product: bool = Field(default=False)
    purchase_price: float = Field(default=0, ge=0)
    mrp: float = Field(default=0, ge=0)
    wsp: float = Field(default=0, ge=0)
    price_incl_vat: bool = Field(default=False)
    sdc_vat_code: str = Field(default="", max_length=40)
    sale_vat: float = Field(default=0, ge=0)
    custom_vat: bool = Field(default=False)
    variations: dict = Field(
        default_factory=lambda: {"attributes": [], "items": []},
        sa_column=Column(JSON, nullable=False),
    )
    price: float = Field(ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_active: bool = Field(default=True)
    is_hidden: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)

    tenant: Tenant = Relationship(back_populates="products")
    branch: Optional[Branch] = Relationship(back_populates="products")
    variants: list["ProductVariant"] = Relationship(
        back_populates="product",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    order_items: list["OrderItem"] = Relationship(back_populates="product")
    purchases: list["Purchase"] = Relationship(back_populates="product")
    sales_returns: list["SalesReturn"] = Relationship(back_populates="product")


class ProductVariant(SQLModel, table=True):
    """Sellable child of a parent product. SKU is unique across the catalog."""

    __tablename__ = "product_variants"

    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="products.id", index=True)
    sku: str = Field(unique=True, index=True, max_length=80)
    attributes: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    inherit_parent: bool = Field(default=True)
    stock_quantity: int = Field(default=0, ge=0)
    price: Optional[float] = Field(default=None, ge=0)
    purchase_price: Optional[float] = Field(default=None, ge=0)
    mrp: Optional[float] = Field(default=None, ge=0)
    wsp: Optional[float] = Field(default=None, ge=0)
    image: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    vendor: Optional[str] = Field(default=None, max_length=120)
    custom_vat: bool = Field(default=False)
    sale_vat: Optional[float] = Field(default=None, ge=0)
    is_active: bool = Field(default=True)

    product: Product = Relationship(back_populates="variants")


class CategoryMaster(SQLModel, table=True):
    __tablename__ = "category_masters"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    name: str = Field(unique=True, index=True, max_length=120)
    is_active: bool = Field(default=True)
    is_hidden: bool = Field(default=False)


class SubCategoryMaster(SQLModel, table=True):
    __tablename__ = "sub_category_masters"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    category_id: int = Field(foreign_key="category_masters.id", index=True)
    name: str = Field(index=True, max_length=120)
    is_active: bool = Field(default=True)
    is_hidden: bool = Field(default=False)


class BrandMaster(SQLModel, table=True):
    __tablename__ = "brand_masters"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    name: str = Field(unique=True, index=True, max_length=120)
    is_active: bool = Field(default=True)
    is_hidden: bool = Field(default=False)


class VendorMaster(SQLModel, table=True):
    __tablename__ = "vendor_masters"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    name: str = Field(unique=True, index=True, max_length=120)
    contact_number: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=255)
    address: str = Field(default="", max_length=500)
    status: str = Field(default="Active", max_length=20)
    is_active: bool = Field(default=True)
    is_hidden: bool = Field(default=False)


class CodeMaster(SQLModel, table=True):
    """Retail code that drives the product name, category, and item-code prefix."""

    __tablename__ = "code_masters"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    code_number: str = Field(unique=True, index=True, max_length=20)
    name: str = Field(max_length=255)
    category_id: int = Field(foreign_key="category_masters.id", index=True)
    sub_category_id: int = Field(foreign_key="sub_category_masters.id", index=True)
    is_active: bool = Field(default=True)
    is_hidden: bool = Field(default=False)


class ApprovalRequest(SQLModel, table=True):
    """Maker-checker queue for master-data creates and edits."""

    __tablename__ = "approval_requests"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    entity_type: str = Field(index=True, max_length=40)
    action: str = Field(max_length=20)
    entity_id: Optional[int] = Field(default=None, index=True)
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    status: str = Field(default="Pending", index=True, max_length=20)
    reason: Optional[str] = Field(default=None, max_length=500)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    module_name: Optional[str] = Field(default=None, max_length=40)
    action_type: Optional[str] = Field(default=None, max_length=20)
    admin_reason: Optional[str] = Field(default=None, max_length=500)
    requested_by: int = Field(foreign_key="users.id", index=True)
    reviewed_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utcnow)
    reviewed_at: Optional[datetime] = Field(default=None)


class AuditLog(SQLModel, table=True):
    """Who changed a record, what changed, and why."""

    __tablename__ = "audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenants.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    action_type: str = Field(index=True, max_length=40)
    entity_type: str = Field(index=True, max_length=40)
    entity_id: Optional[int] = Field(default=None, index=True)
    changes: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    reason: Optional[str] = Field(default=None, max_length=500)
    method: str = Field(default="Web UI", max_length=40)
    created_at: datetime = Field(default_factory=utcnow)


class SystemSetting(SQLModel, table=True):
    """Small key/value store for system defaults such as VAT."""

    __tablename__ = "system_settings"

    key: str = Field(primary_key=True, max_length=80)
    value: str = Field(default="", max_length=40)


class Order(SQLModel, table=True):
    """POS sale header scoped to a tenant branch."""

    __tablename__ = "orders"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    branch_id: int = Field(foreign_key="branches.id", index=True)
    total_amount: float = Field(ge=0)
    customer_phone: Optional[str] = Field(default=None, max_length=50)
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
    variant_id: Optional[int] = Field(default=None, foreign_key="product_variants.id", index=True)
    quantity: int = Field(ge=1)
    price: float = Field(ge=0)

    order: Order = Relationship(back_populates="items")
    product: Product = Relationship(back_populates="order_items")


class Expense(SQLModel, table=True):
    """Petty cash spend logged against a tenant branch."""

    __tablename__ = "expenses"

    id: Optional[int] = Field(default=None, primary_key=True)
    description: str = Field(max_length=500)
    amount: float = Field(ge=0)
    date: datetime = Field(default_factory=utcnow, index=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    branch_id: int = Field(foreign_key="branches.id", index=True)
    created_by: str = Field(max_length=255, index=True)


class ExpenseCreate(SQLModel):
    description: str
    amount: float
    tenant_id: Optional[int] = None
    branch_id: Optional[int] = None


class ExpenseRead(SQLModel):
    id: int
    description: str
    amount: float
    date: datetime
    tenant_id: int
    branch_id: int
    created_by: str


class Purchase(SQLModel, table=True):
    """Stock receipt that increases on-hand inventory."""

    __tablename__ = "purchases"

    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="products.id", index=True)
    supplier_name: str = Field(max_length=255)
    quantity_added: int = Field(ge=1)
    cost_price: float = Field(ge=0)
    date: datetime = Field(default_factory=utcnow, index=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    branch_id: int = Field(foreign_key="branches.id", index=True)
    created_by: str = Field(max_length=255, index=True)

    product: Optional[Product] = Relationship(back_populates="purchases")


class PurchaseCreate(SQLModel):
    product_id: int
    supplier_name: str
    quantity_added: int
    cost_price: float
    tenant_id: Optional[int] = None
    branch_id: Optional[int] = None


class PurchaseRead(SQLModel):
    id: int
    product_id: int
    product_name: str = ""
    supplier_name: str
    quantity_added: int
    cost_price: float
    date: datetime
    tenant_id: int
    branch_id: int
    created_by: str


class SalesReturn(SQLModel, table=True):
    """Customer refund that restocks inventory."""

    __tablename__ = "sales_returns"

    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: int = Field(index=True)
    product_id: int = Field(foreign_key="products.id", index=True)
    quantity_returned: int = Field(ge=1)
    refund_amount: float = Field(ge=0)
    reason: str = Field(max_length=500)
    date: datetime = Field(default_factory=utcnow, index=True)
    tenant_id: int = Field(foreign_key="tenants.id", index=True)
    branch_id: int = Field(foreign_key="branches.id", index=True)
    created_by: str = Field(max_length=255, index=True)

    product: Optional[Product] = Relationship(back_populates="sales_returns")


class ReturnCreate(SQLModel):
    order_id: int
    product_id: int
    quantity_returned: int
    refund_amount: float
    reason: str
    tenant_id: Optional[int] = None
    branch_id: Optional[int] = None


class ReturnRead(SQLModel):
    id: int
    order_id: int
    product_id: int
    product_name: str = ""
    quantity_returned: int
    refund_amount: float
    reason: str
    date: datetime
    tenant_id: int
    branch_id: int
    created_by: str

