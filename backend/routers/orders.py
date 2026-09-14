from datetime import datetime
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user
from database import get_session
from models import Branch, Order, OrderItem, Product, Tenant, User

router = APIRouter()


class OrderItemCreate(SQLModel):
    product_id: int
    quantity: int
    price: float


class OrderCreate(SQLModel):
    tenant_id: int
    branch_id: int
    items: list[OrderItemCreate]
    customer_phone: Optional[str] = None


class OrderItemRead(SQLModel):
    id: int
    product_id: int
    quantity: int
    price: float
    name: str = ""


class OrderRead(SQLModel):
    id: int
    tenant_id: int
    branch_id: int
    total_amount: float
    created_at: datetime
    customer_phone: Optional[str] = None
    items: list[OrderItemRead] = []


_ORDER_LOAD = selectinload(Order.items).selectinload(OrderItem.product)


def serialize_order(order: Order) -> OrderRead:
    return OrderRead(
        id=order.id or 0,
        tenant_id=order.tenant_id,
        branch_id=order.branch_id,
        total_amount=order.total_amount,
        created_at=order.created_at,
        customer_phone=order.customer_phone,
        items=[
            OrderItemRead(
                id=item.id or 0,
                product_id=item.product_id,
                quantity=item.quantity,
                price=item.price,
                name=item.product.name if item.product is not None else f"Product #{item.product_id}",
            )
            for item in order.items
        ],
    )


async def _require_scope(session: AsyncSession, tenant_id: int, branch_id: int) -> None:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    branch = await session.get(Branch, branch_id)
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    if branch.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch does not belong to the given tenant",
        )


def send_sms_notification(phone: str, amount: float) -> None:
    print(f"SMS sent to {phone} for amount {amount}")


@router.get("/", response_model=list[OrderRead])
async def list_orders(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[OrderRead]:
    result = await session.exec(
        select(Order).options(_ORDER_LOAD).order_by(Order.created_at.desc())
    )
    return [serialize_order(order) for order in result.all()]


@router.post("/", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> OrderRead:
    if not payload.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must include at least one item",
        )

    await _require_scope(session, payload.tenant_id, payload.branch_id)

    needed: dict[int, int] = defaultdict(int)
    for item in payload.items:
        if item.quantity < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item quantity must be at least 1",
            )
        if item.price < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item price cannot be negative",
            )
        needed[item.product_id] += item.quantity

    products: dict[int, Product] = {}
    for product_id, quantity in needed.items():
        statement = select(Product).where(Product.id == product_id).with_for_update()
        product = (await session.exec(statement)).first()
        if product is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found",
            )
        if product.tenant_id != payload.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{product.name}' does not belong to the given tenant",
            )
        if not product.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{product.name}' is inactive",
            )
        if product.stock_quantity < quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Insufficient stock for '{product.name}'. "
                    f"Available: {product.stock_quantity}, requested: {quantity}"
                ),
            )
        products[product_id] = product

    total_amount = sum(item.quantity * item.price for item in payload.items)
    phone = (payload.customer_phone or "").strip() or None
    order = Order(
        tenant_id=payload.tenant_id,
        branch_id=payload.branch_id,
        total_amount=round(total_amount, 2),
        customer_phone=phone,
    )
    session.add(order)

    try:
        await session.flush()
        for item in payload.items:
            session.add(
                OrderItem(
                    order_id=order.id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    price=item.price,
                )
            )
        for product_id, quantity in needed.items():
            products[product_id].stock_quantity -= quantity
            session.add(products[product_id])
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create order",
        ) from None

    loaded = (
        await session.exec(
            select(Order).where(Order.id == order.id).options(_ORDER_LOAD)
        )
    ).one()
    if loaded.customer_phone:
        send_sms_notification(loaded.customer_phone, loaded.total_amount)
    return serialize_order(loaded)
