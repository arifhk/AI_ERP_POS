"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import create_access_token, get_current_user, hash_password, verify_password
from config import cors_origins
from database import get_session, init_db
import models  # noqa: F401  — register tables on SQLModel.metadata
from models import (
    Expense,
    ExpenseCreate,
    ExpenseRead,
    Order,
    Product,
    Purchase,
    PurchaseCreate,
    PurchaseRead,
    ReturnCreate,
    ReturnRead,
    SalesReturn,
    User,
    parse_iso_datetime,
)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ai-erp-pos.vercel.app",
        *cors_origins(),
    ],
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


class ApproveUser(SQLModel):
    role: str
    branch_id: int
    is_active: bool = True


def _require_admin(current_user: User) -> None:
    if (current_user.role or "").strip().lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


def _is_cashier_user(user: User) -> bool:
    return (user.role or "").strip().lower() == "cashier"


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

    name = payload.name.strip()
    email = payload.email.strip()
    if not name or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name and email are required",
        )

    user = User(
        email=email,
        name=name,
        hashed_password=hash_password(password),
        role="Pending",
        tenant_id=1,
        branch_id=None,
        is_active=False,
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
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending admin approval",
        )
    return Token(access_token=create_access_token({"sub": user.email, "role": user.role}))


@app.patch("/users/{user_id}/approve", response_model=UserRead)
async def approve_user(
    user_id: int,
    payload: ApproveUser,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> User:
    _require_admin(current_user)
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    role = payload.role.strip()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role is required",
        )

    tenant_id = user.tenant_id or 1
    await _validate_scope(session, tenant_id, payload.branch_id, role)
    user.role = role
    user.branch_id = payload.branch_id
    user.tenant_id = tenant_id
    user.is_active = True
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@app.get("/dashboard-stats/")
async def dashboard_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, float | int]:
    sales_statement = select(func.coalesce(func.sum(Order.total_amount), 0.0))
    total_sales = (await session.exec(sales_statement)).one()
    user_count = (await session.exec(select(func.count(User.id)))).one()
    return {
        "total_sales": float(total_sales or 0),
        "user_count": int(user_count or 0),
    }


class ChartPoint(SQLModel):
    date: str
    total: float


class CustomerSummary(SQLModel):
    customer_phone: str
    total_visits: int
    total_spent: float


@app.get("/chart-data/", response_model=list[ChartPoint])
async def chart_data(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ChartPoint]:
    day = func.date(Order.created_at)
    statement = (
        select(day, func.coalesce(func.sum(Order.total_amount), 0.0))
        .group_by(day)
        .order_by(day)
    )
    rows = (await session.exec(statement)).all()
    return [
        ChartPoint(date=str(row[0]), total=round(float(row[1] or 0), 2))
        for row in rows
        if row[0] is not None
    ]


@app.get("/customers/", response_model=list[CustomerSummary])
async def list_customers(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[CustomerSummary]:
    phone = func.trim(Order.customer_phone)
    visits = func.count(Order.id)
    spent = func.coalesce(func.sum(Order.total_amount), 0.0)
    statement = (
        select(phone, visits, spent)
        .where(Order.customer_phone.is_not(None))
        .where(phone != "")
        .group_by(phone)
        .order_by(spent.desc())
    )
    rows = (await session.exec(statement)).all()
    return [
        CustomerSummary(
            customer_phone=str(row[0]),
            total_visits=int(row[1] or 0),
            total_spent=round(float(row[2] or 0), 2),
        )
        for row in rows
        if row[0]
    ]


@app.post("/expenses/", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    payload: ExpenseCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Expense:
    description = payload.description.strip()
    if not description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description is required",
        )
    if payload.amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be zero or greater",
        )

    tenant_id = payload.tenant_id or current_user.tenant_id or 1
    branch_id = payload.branch_id or current_user.branch_id or 1
    if _is_cashier_user(current_user):
        if current_user.branch_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cashier account is not assigned to a branch",
            )
        branch_id = current_user.branch_id
        tenant_id = current_user.tenant_id or tenant_id

    expense = Expense(
        description=description,
        amount=float(payload.amount),
        tenant_id=tenant_id,
        branch_id=branch_id,
        created_by=current_user.email,
    )
    session.add(expense)
    await session.commit()
    await session.refresh(expense)
    return expense


@app.get("/expenses/", response_model=list[ExpenseRead])
async def list_expenses(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[Expense]:
    statement = select(Expense).order_by(Expense.date.desc(), Expense.id.desc())
    try:
        start = parse_iso_datetime(start_date)
        end = parse_iso_datetime(end_date, is_end=True)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    if start is not None:
        statement = statement.where(Expense.date >= start)
    if end is not None:
        statement = statement.where(Expense.date <= end)
    if _is_cashier_user(current_user):
        if current_user.branch_id is None:
            return []
        statement = statement.where(Expense.branch_id == current_user.branch_id)
    return list((await session.exec(statement)).all())


def _serialize_purchase(purchase: Purchase) -> PurchaseRead:
    product_name = ""
    if purchase.product is not None:
        product_name = purchase.product.name
    return PurchaseRead(
        id=purchase.id or 0,
        product_id=purchase.product_id,
        product_name=product_name,
        supplier_name=purchase.supplier_name,
        quantity_added=purchase.quantity_added,
        cost_price=purchase.cost_price,
        date=purchase.date,
        tenant_id=purchase.tenant_id,
        branch_id=purchase.branch_id,
        created_by=purchase.created_by,
    )


@app.post("/purchases/", response_model=PurchaseRead, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    payload: PurchaseCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> PurchaseRead:
    supplier_name = payload.supplier_name.strip()
    if not supplier_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier name is required",
        )
    if payload.quantity_added < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity must be at least 1",
        )
    if payload.cost_price < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cost price cannot be negative",
        )

    tenant_id = payload.tenant_id or current_user.tenant_id or 1
    branch_id = payload.branch_id or current_user.branch_id or 1
    if _is_cashier_user(current_user):
        if current_user.branch_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cashier account is not assigned to a branch",
            )
        branch_id = current_user.branch_id
        tenant_id = current_user.tenant_id or tenant_id

    statement = select(Product).where(Product.id == payload.product_id).with_for_update()
    product = (await session.exec(statement)).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    purchase = Purchase(
        product_id=product.id or payload.product_id,
        supplier_name=supplier_name,
        quantity_added=payload.quantity_added,
        cost_price=float(payload.cost_price),
        tenant_id=tenant_id,
        branch_id=branch_id,
        created_by=current_user.email,
    )
    product.stock_quantity += payload.quantity_added
    session.add(purchase)
    session.add(product)
    await session.commit()
    await session.refresh(purchase)
    purchase.product = product
    return _serialize_purchase(purchase)


@app.get("/purchases/", response_model=list[PurchaseRead])
async def list_purchases(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[PurchaseRead]:
    statement = (
        select(Purchase)
        .options(selectinload(Purchase.product))
        .order_by(Purchase.date.desc(), Purchase.id.desc())
    )
    if _is_cashier_user(current_user):
        if current_user.branch_id is None:
            return []
        statement = statement.where(Purchase.branch_id == current_user.branch_id)
    purchases = list((await session.exec(statement)).all())
    return [_serialize_purchase(purchase) for purchase in purchases]


def _serialize_return(row: SalesReturn) -> ReturnRead:
    product_name = ""
    if row.product is not None:
        product_name = row.product.name
    return ReturnRead(
        id=row.id or 0,
        order_id=row.order_id,
        product_id=row.product_id,
        product_name=product_name,
        quantity_returned=row.quantity_returned,
        refund_amount=row.refund_amount,
        reason=row.reason,
        date=row.date,
        tenant_id=row.tenant_id,
        branch_id=row.branch_id,
        created_by=row.created_by,
    )


@app.post("/returns/", response_model=ReturnRead, status_code=status.HTTP_201_CREATED)
async def create_return(
    payload: ReturnCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReturnRead:
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reason is required",
        )
    if payload.quantity_returned < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity returned must be at least 1",
        )
    if payload.refund_amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refund amount cannot be negative",
        )

    order = (
        await session.exec(
            select(Order)
            .where(Order.id == payload.order_id)
            .options(selectinload(Order.items))
        )
    ).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if _is_cashier_user(current_user):
        if current_user.branch_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cashier account is not assigned to a branch",
            )
        if order.branch_id != current_user.branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot return an order from another branch",
            )

    sold_qty = sum(
        item.quantity for item in order.items if item.product_id == payload.product_id
    )
    if sold_qty < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected product is not on this order",
        )

    already_returned = (
        await session.exec(
            select(func.coalesce(func.sum(SalesReturn.quantity_returned), 0)).where(
                SalesReturn.order_id == payload.order_id,
                SalesReturn.product_id == payload.product_id,
            )
        )
    ).one()
    remaining = int(sold_qty) - int(already_returned or 0)
    if remaining < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All units of this product have already been returned",
        )
    if payload.quantity_returned > remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot return more than {remaining} remaining unit(s)",
        )

    product = (
        await session.exec(
            select(Product).where(Product.id == payload.product_id).with_for_update()
        )
    ).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    tenant_id = payload.tenant_id or order.tenant_id
    branch_id = payload.branch_id or order.branch_id
    if _is_cashier_user(current_user):
        branch_id = current_user.branch_id or branch_id
        tenant_id = current_user.tenant_id or tenant_id

    row = SalesReturn(
        order_id=order.id or payload.order_id,
        product_id=product.id or payload.product_id,
        quantity_returned=payload.quantity_returned,
        refund_amount=float(payload.refund_amount),
        reason=reason,
        tenant_id=tenant_id,
        branch_id=branch_id,
        created_by=current_user.email,
    )
    product.stock_quantity += payload.quantity_returned
    session.add(row)
    session.add(product)
    await session.commit()
    await session.refresh(row)
    row.product = product
    return _serialize_return(row)


@app.get("/returns/", response_model=list[ReturnRead])
async def list_returns(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ReturnRead]:
    statement = (
        select(SalesReturn)
        .options(selectinload(SalesReturn.product))
        .order_by(SalesReturn.date.desc(), SalesReturn.id.desc())
    )
    try:
        start = parse_iso_datetime(start_date)
        end = parse_iso_datetime(end_date, is_end=True)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    if start is not None:
        statement = statement.where(SalesReturn.date >= start)
    if end is not None:
        statement = statement.where(SalesReturn.date <= end)
    if _is_cashier_user(current_user):
        if current_user.branch_id is None:
            return []
        statement = statement.where(SalesReturn.branch_id == current_user.branch_id)
    rows = list((await session.exec(statement)).all())
    return [_serialize_return(row) for row in rows]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
