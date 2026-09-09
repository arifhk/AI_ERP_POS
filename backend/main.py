"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from database import get_session, init_db
import models  # noqa: F401  — register tables on SQLModel.metadata
from models import Order, User
from routers import branches, orders, products, tenants, users


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="AI ERP & POS",
    description="Multi-tenant SaaS ERP and point of sale API",
    version="0.1.0",
    lifespan=lifespan,
)


from fastapi.middleware.cors import CORSMiddleware

# ফ্রন্টএন্ডকে ডেটা নেওয়ার পারমিশন দেওয়া
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tenants.router, prefix="/tenants", tags=["Tenants"])
app.include_router(branches.router, prefix="/branches", tags=["Branches"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(products.router, prefix="/products", tags=["Products"])
app.include_router(orders.router, prefix="/orders", tags=["Orders"])  # POS checkout



@app.get("/dashboard-stats/")
async def dashboard_stats(
    session: AsyncSession = Depends(get_session),
) -> dict[str, float | int]:
    sales_statement = select(func.coalesce(func.sum(Order.total_amount), 0.0))
    total_sales = (await session.exec(sales_statement)).one()
    user_count = (await session.exec(select(func.count(User.id)))).one()
    return {
        "total_sales": float(total_sales or 0),
        "user_count": int(user_count or 0),
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
