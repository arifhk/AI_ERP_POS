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


def _align_pluspoint_admin_role(connection) -> None:
    """Ensure the Plus Point operator account is stored as Admin, not Cashier."""
    inspector = inspect(connection)
    if not inspector.has_table("users"):
        return
    connection.execute(
        text(
            "UPDATE users SET role = 'Admin', is_active = 1 "
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
                    role="Admin",
                    tenant_id=1,
                    branch_id=1,
                    is_active=True,
                )
            )
        else:
            user.role = "Admin"
            user.is_active = True
            user.hashed_password = password_hash
            if user.tenant_id is None:
                user.tenant_id = 1
            session.add(user)
        await session.commit()


async def init_db() -> None:
    """Create tables from SQLModel metadata. Import models before calling."""
    async with engine.begin() as conn:
        await conn.run_sync(_align_products_schema)
        await conn.run_sync(_align_users_schema)
        await conn.run_sync(_align_orders_schema)
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.run_sync(_align_pluspoint_admin_role)
    await _ensure_bootstrap_admin()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: one AsyncSession per request."""
    async with async_session_maker() as session:
        yield session
