"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import create_access_token, hash_password, verify_password
from database import get_session, init_db
import models  # noqa: F401  — register tables on SQLModel.metadata
from models import Order, User
from routers import branches, orders, products, tenants, users
from routers.users import UserRead, _validate_scope


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


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


class RegisterUser(SQLModel):
    name: str
    email: str
    password: str
    tenant_id: Optional[int] = 1
    branch_id: Optional[int] = 1
    role: str = "Cashier"
    is_active: bool = True


@app.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterUser,
    session: AsyncSession = Depends(get_session),
) -> User:
    password = payload.password.strip()
    if not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required",
        )

    await _validate_scope(session, payload.tenant_id, payload.branch_id, payload.role)
    user = User(
        email=payload.email.strip(),
        name=payload.name.strip(),
        hashed_password=hash_password(password),
        role=payload.role.strip() or "Cashier",
        tenant_id=payload.tenant_id,
        branch_id=payload.branch_id,
        is_active=payload.is_active,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already exists",
        ) from None
    await session.refresh(user)
    return user


@app.post("/login", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: AsyncSession = Depends(get_session),
) -> Token:
    statement = select(User).where(User.email == form_data.username.strip())
    user = (await session.exec(statement)).first()
    stored_hash = user.hashed_password if user is not None else None
    if (
        user is None
        or not stored_hash
        or not verify_password(form_data.password, stored_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )
    return Token(access_token=create_access_token({"sub": str(user.id)}))


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
