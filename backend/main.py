"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from database import init_db
import models  # noqa: F401  — register tables on SQLModel.metadata
from routers import branches, products, tenants, users


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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
