"""Async SQLite engine and session factory (swap URL later for PostgreSQL)."""

from collections.abc import AsyncGenerator

from sqlalchemy import event, inspect, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

# Local development. For PostgreSQL later:
# DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5432/erp_pos"
DATABASE_URL = "sqlite+aiosqlite:///./erp_pos.db"

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


async def init_db() -> None:
    """Create tables from SQLModel metadata. Import models before calling."""
    async with engine.begin() as conn:
        await conn.run_sync(_align_products_schema)
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: one AsyncSession per request."""
    async with async_session_maker() as session:
        yield session
