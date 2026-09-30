"""Async SQLite engine and session factory (swap URL later for PostgreSQL)."""

from collections.abc import AsyncGenerator

from sqlalchemy import event, inspect, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from config import DATABASE_URL

connect_args: dict = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    connect_args=connect_args,
)


@event.listens_for(engine.sync_engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


def _align_products_schema(connection) -> None:
    """Rebuild products if it still uses the pre-barcode catalog columns."""
    inspector = inspect(connection)
    if not inspector.has_table("products"):
        return
    columns = {column["name"] for column in inspector.get_columns("products")}
    if "price" in columns and "sku" not in columns:
        return
    connection.execute(text("DROP TABLE products"))


def _align_product_extra_barcodes(connection) -> None:
    """Add catalog columns on existing databases without rebuilding products."""
    inspector = inspect(connection)
    if not inspector.has_table("products"):
        return
    columns = {column["name"] for column in inspector.get_columns("products")}
    additions = {
        "additional_barcodes": "TEXT NOT NULL DEFAULT '[]'",
        "image": "TEXT",
        "category": "VARCHAR(120) NOT NULL DEFAULT ''",
        "sub_category": "VARCHAR(120) NOT NULL DEFAULT ''",
        "brand": "VARCHAR(120) NOT NULL DEFAULT ''",
        "vendor": "VARCHAR(120) NOT NULL DEFAULT ''",
        "design_code": "VARCHAR(80) NOT NULL DEFAULT ''",
        "design_number": "VARCHAR(40) NOT NULL DEFAULT ''",
        "item_code": "VARCHAR(80)",
        "code_id": "INTEGER",
        "category_id": "INTEGER",
        "sub_category_id": "INTEGER",
        "brand_id": "INTEGER",
        "vendor_id": "INTEGER",
        "ec_product": "INTEGER NOT NULL DEFAULT 0",
        "purchase_price": "REAL NOT NULL DEFAULT 0",
        "mrp": "REAL NOT NULL DEFAULT 0",
        "wsp": "REAL NOT NULL DEFAULT 0",
        "price_incl_vat": "INTEGER NOT NULL DEFAULT 0",
        "sdc_vat_code": "VARCHAR(40) NOT NULL DEFAULT ''",
        "sale_vat": "REAL NOT NULL DEFAULT 0",
        "custom_vat": "INTEGER NOT NULL DEFAULT 0",
        "variations": "TEXT NOT NULL DEFAULT '{\"attributes\": [], \"items\": []}'",
    }
    for name, ddl in additions.items():
        if name not in columns:
            connection.execute(text(f"ALTER TABLE products ADD COLUMN {name} {ddl}"))
    connection.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_products_item_code "
            "ON products(item_code) WHERE item_code IS NOT NULL AND item_code != ''"
        )
    )


def _align_order_variant_column(connection) -> None:
    inspector = inspect(connection)
    if not inspector.has_table("order_items"):
        return
    columns = {column["name"] for column in inspector.get_columns("order_items")}
    if "variant_id" not in columns:
        connection.execute(text("ALTER TABLE order_items ADD COLUMN variant_id INTEGER"))


def _align_users_schema(connection) -> None:
    """Rename legacy full_name to name without dropping staff rows."""
    inspector = inspect(connection)
    if not inspector.has_table("users"):
        return
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "full_name" in columns and "name" not in columns:
        connection.execute(text("ALTER TABLE users RENAME COLUMN full_name TO name"))
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "hashed_password" not in columns:
        connection.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR(255)"))


def _align_orders_schema(connection) -> None:
    """Add optional customer_phone for SMS / loyalty without dropping sales."""
    inspector = inspect(connection)
    if not inspector.has_table("orders"):
        return
    columns = {column["name"] for column in inspector.get_columns("orders")}
    if "customer_phone" not in columns:
        connection.execute(text("ALTER TABLE orders ADD COLUMN customer_phone VARCHAR(50)"))


def _align_visibility_flags(connection) -> None:
    """Add active and hidden flags without rewriting existing rows."""
    inspector = inspect(connection)
    tables = {
        "products": ("is_hidden",),
        "category_masters": ("is_active", "is_hidden"),
        "sub_category_masters": ("is_active", "is_hidden"),
        "brand_masters": ("is_active", "is_hidden"),
        "vendor_masters": ("is_active", "is_hidden"),
        "code_masters": ("is_active", "is_hidden"),
    }
    for table, names in tables.items():
        if not inspector.has_table(table):
            continue
        columns = {column["name"] for column in inspector.get_columns(table)}
        for name in names:
            if name in columns:
                continue
            default = "TRUE" if name == "is_active" else "FALSE"
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} BOOLEAN DEFAULT {default}"))
            if table == "vendor_masters" and name == "is_active":
                connection.execute(text("UPDATE vendor_masters SET is_active = FALSE WHERE lower(status) = 'inactive'"))


def _align_vendor_profile(connection) -> None:
    """Add contact fields on vendors without dropping existing names."""
    inspector = inspect(connection)
    if not inspector.has_table("vendor_masters"):
        return
    columns = {column["name"] for column in inspector.get_columns("vendor_masters")}
    additions = {
        "contact_number": "VARCHAR(40) DEFAULT ''",
        "email": "VARCHAR(255) DEFAULT ''",
        "address": "VARCHAR(500) DEFAULT ''",
        "status": "VARCHAR(20) DEFAULT 'Active'",
    }
    for name, column_type in additions.items():
        if name not in columns:
            connection.execute(text(f"ALTER TABLE vendor_masters ADD COLUMN {name} {column_type}"))
    connection.execute(text("UPDATE vendor_masters SET status = 'Active' WHERE status IS NULL OR status = ''"))


def _align_approval_requests(connection) -> None:
    """Add maker-checker columns without rewriting existing approval rows."""
    inspector = inspect(connection)
    if not inspector.has_table("approval_requests"):
        return
    columns = {column["name"] for column in inspector.get_columns("approval_requests")}
    additions = {
        "user_id": "INTEGER",
        "module_name": "VARCHAR(40)",
        "action_type": "VARCHAR(20)",
        "admin_reason": "VARCHAR(500)",
    }
    for name, column_type in additions.items():
        if name not in columns:
            connection.execute(text(f"ALTER TABLE approval_requests ADD COLUMN {name} {column_type}"))
    connection.execute(text("UPDATE approval_requests SET user_id = requested_by WHERE user_id IS NULL"))


def _align_tenant_columns(connection) -> None:
    """Add tenant ownership and SaaS identity columns on databases created earlier."""
    inspector = inspect(connection)
    if inspector.has_table("tenants"):
        columns = {column["name"] for column in inspector.get_columns("tenants")}
        additions = {
            "domain": "VARCHAR(255)",
            "subdomain": "VARCHAR(80)",
            "status": "VARCHAR(20) DEFAULT 'active'",
        }
        for name, column_type in additions.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE tenants ADD COLUMN {name} {column_type}"))
        connection.execute(text("UPDATE tenants SET status = 'active' WHERE status IS NULL OR status = ''"))

    owned = (
        "category_masters",
        "sub_category_masters",
        "brand_masters",
        "vendor_masters",
        "code_masters",
        "approval_requests",
        "audit_logs",
    )
    for table in owned:
        if not inspector.has_table(table):
            continue
        columns = {column["name"] for column in inspector.get_columns(table)}
        if "tenant_id" not in columns:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN tenant_id INTEGER"))
        connection.execute(text(f"UPDATE {table} SET tenant_id = 1 WHERE tenant_id IS NULL"))


def _align_pluspoint_admin_role(connection) -> None:
    """Software owner is Super Admin. Other Admin accounts become Tenant Admins."""
    inspector = inspect(connection)
    if not inspector.has_table("users"):
        return
    connection.execute(
        text(
            "UPDATE users SET role = 'tenant_admin' "
            "WHERE lower(replace(role, ' ', '_')) = 'admin' "
            "AND lower(email) != 'admin@pluspoint.com'"
        )
    )
    connection.execute(
        text(
            "UPDATE users SET role = 'tenant_user' "
            "WHERE lower(replace(replace(role, ' ', '_'), '-', '_')) IN "
            "('cashier', 'manager', 'inventory', 'user')"
        )
    )
    connection.execute(
        text(
            "UPDATE users SET role = 'system_owner', is_active = TRUE, tenant_id = NULL "
            "WHERE lower(email) = 'admin@pluspoint.com'"
        )
    )


DEFAULT_ADMIN_EMAIL = "admin@pluspoint.com"
DEFAULT_ADMIN_PASSWORD = "123456"


async def _ensure_bootstrap_admin() -> None:
    """Create or reset the default operator so a fresh database can log in."""
    from auth import hash_password
    from models import Branch, Tenant, User
    from sqlmodel import select

    async with async_session_maker() as session:
        tenant = await session.get(Tenant, 1)
        if tenant is None:
            session.add(
                Tenant(
                    id=1,
                    name="Plus Point",
                    slug="plus-point",
                    email=DEFAULT_ADMIN_EMAIL,
                )
            )
            await session.flush()

        branch = await session.get(Branch, 1)
        if branch is None:
            session.add(
                Branch(
                    id=1,
                    tenant_id=1,
                    name="Main Branch",
                    code="MAIN",
                )
            )
            await session.flush()

        statement = select(User).where(User.email == DEFAULT_ADMIN_EMAIL)
        user = (await session.exec(statement)).first()
        password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
        if user is None:
            session.add(
                User(
                    email=DEFAULT_ADMIN_EMAIL,
                    name="Plus Point Admin",
                    hashed_password=password_hash,
                    role="system_owner",
                    tenant_id=None,
                    branch_id=1,
                    is_active=True,
                )
            )
        else:
            user.role = "system_owner"
            user.tenant_id = None
            user.is_active = True
            user.hashed_password = password_hash
            session.add(user)
        await session.commit()


async def _ensure_default_vat() -> None:
    from models import SystemSetting

    async with async_session_maker() as session:
        current = await session.get(SystemSetting, "default_vat")
        if current is None:
            session.add(SystemSetting(key="default_vat", value="5"))
            await session.commit()


async def init_db() -> None:
    """Create tables from SQLModel metadata. Import models before calling."""
    async with engine.begin() as conn:
        await conn.run_sync(_align_products_schema)
        await conn.run_sync(_align_users_schema)
        await conn.run_sync(_align_orders_schema)
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.run_sync(_align_product_extra_barcodes)
        await conn.run_sync(_align_order_variant_column)
        await conn.run_sync(_align_approval_requests)
        await conn.run_sync(_align_vendor_profile)
        await conn.run_sync(_align_visibility_flags)
        await conn.run_sync(_align_tenant_columns)
        await conn.run_sync(_align_pluspoint_admin_role)
    await _ensure_bootstrap_admin()
    await _ensure_default_vat()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: one AsyncSession per request."""
    async with async_session_maker() as session:
        yield session
