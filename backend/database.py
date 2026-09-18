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


async def init_db() -> None:
    """Create tables from SQLModel metadata. Import models before calling."""
    async with engine.begin() as conn:
        await conn.run_sync(_align_products_schema)
        await conn.run_sync(_align_users_schema)
        await conn.run_sync(_align_orders_schema)
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.run_sync(_align_pluspoint_admin_role)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: one AsyncSession per request."""
    async with async_session_maker() as session:
        yield session
