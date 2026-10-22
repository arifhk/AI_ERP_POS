"""POS checkout. The sale header, lines, and stock deduction commit together."""

from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user
from database import get_session
from models import Branch, Order, OrderItem, Product, ProductVariant, User

router = APIRouter()


def _money(value: object, label: str) -> float:
    try:
        amount = round(float(value), 2)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} must be a number") from None
    if amount < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} cannot be negative")
    return amount


def _qty(value: object) -> int:
    try:
        quantity = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each item needs a whole quantity") from None
    if quantity < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item quantity must be at least 1")
    return quantity


def _product_id(value: object) -> Optional[int]:
    if isinstance(value, bool) or value is None or value == "":
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


async def _sale_branch(session: AsyncSession, user: User) -> tuple[int, int]:
    if user.branch_id:
        branch = await session.get(Branch, user.branch_id)
        if branch is None or branch.id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch not found")
        return user.tenant_id or branch.tenant_id, branch.id
    if user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account is not assigned to a branch",
        )
    branch = (
        await session.exec(select(Branch).where(Branch.tenant_id == user.tenant_id).order_by(Branch.id))
    ).first()
    if branch is None or branch.id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No branch is configured for this sale")
    return user.tenant_id, branch.id


async def _locate(session: AsyncSession, barcode: str, product_id: Optional[int]) -> tuple[Optional[int], Optional[int]]:
    code = barcode.strip().lower()
    if code:
        variant = (
            await session.exec(select(ProductVariant).where(func.lower(ProductVariant.sku) == code))
        ).first()
        if variant is not None:
            return variant.product_id, variant.id
        product = (
            await session.exec(
                select(Product).where(
                    or_(func.lower(Product.barcode) == code, func.lower(Product.item_code) == code)
                )
            )
        ).first()
        if product is not None and product.id is not None:
            return product.id, None
        for candidate in (await session.exec(select(Product))).all():
            extras = [str(item).strip().lower() for item in (candidate.additional_barcodes or [])]
            if code in extras and candidate.id is not None:
                return candidate.id, None
    if product_id is None:
        return None, None
    product = await session.get(Product, product_id)
    if product is not None and product.id is not None:
        return product.id, None
    variant = await session.get(ProductVariant, product_id)
    if variant is not None:
        return variant.product_id, variant.id
    return None, None


async def _lock_product(session: AsyncSession, product_id: int) -> Optional[Product]:
    statement = select(Product).where(Product.id == product_id).with_for_update()
    return (await session.exec(statement)).first()


async def _lock_variant(session: AsyncSession, variant_id: int) -> Optional[ProductVariant]:
    statement = select(ProductVariant).where(ProductVariant.id == variant_id).with_for_update()
    return (await session.exec(statement)).first()


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_invoice(
    payload: dict,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    customer = payload.get("customer") if isinstance(payload.get("customer"), dict) else {}
    raw_items = payload.get("items")
    payment = payload.get("payment") if isinstance(payload.get("payment"), dict) else None
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else None
    if not isinstance(raw_items, list) or not raw_items or payment is None or summary is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invoice is incomplete")

    tenant_id, branch_id = await _sale_branch(session, current_user)
    lines: list[dict] = []
    try:
        for raw in raw_items:
            if not isinstance(raw, dict):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each item must be an object")
            barcode = str(raw.get("barcode") or "").strip()
            product_key = _product_id(raw.get("productId"))
            product_id, variant_id = await _locate(session, barcode, product_key)
            if product_id is None:
                label = barcode or product_key or "item"
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Product {label} not found")
            lines.append(
                {
                    "product_id": product_id,
                    "variant_id": variant_id,
                    "qty": _qty(raw.get("qty")),
                    "unit_price": _money(raw.get("unitPrice") or 0, "Unit price"),
                    "discount": _money(raw.get("discount") or 0, "Discount"),
                    "subtotal": _money(raw.get("subtotal") or 0, "Subtotal"),
                }
            )

        product_needed: dict[int, int] = defaultdict(int)
        variant_needed: dict[int, int] = defaultdict(int)
        for line in lines:
            if line["variant_id"]:
                variant_needed[line["variant_id"]] += line["qty"]
            else:
                product_needed[line["product_id"]] += line["qty"]

        products: dict[int, Product] = {}
        for product_id in sorted(set(product_needed) | {line["product_id"] for line in lines}):
            product = await _lock_product(session, product_id)
            if product is None or product.id is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product {product_id} not found")
            if product.tenant_id != tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Product '{product.name}' does not belong to this account",
                )
            if not product.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Product '{product.name}' is inactive",
                )
            products[product.id] = product

        variants: dict[int, ProductVariant] = {}
        for variant_id in sorted(variant_needed):
            variant = await _lock_variant(session, variant_id)
            if variant is None or variant.id is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Variant {variant_id} not found")
            parent = products.get(variant.product_id)
            if parent is None or variant.product_id != parent.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Variant does not belong to the given product",
                )
            if not variant.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Variant '{variant.sku}' is inactive",
                )
            variants[variant.id] = variant

        for product_id, quantity in product_needed.items():
            product = products[product_id]
            if product.stock_quantity < quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Insufficient stock for '{product.name}'. "
                        f"Available: {product.stock_quantity}, requested: {quantity}"
                    ),
                )
        for variant_id, quantity in variant_needed.items():
            variant = variants[variant_id]
            if variant.stock_quantity < quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Insufficient stock for '{variant.sku}'. "
                        f"Available: {variant.stock_quantity}, requested: {quantity}"
                    ),
                )

        net_amount = _money(summary.get("netAmount", payment.get("totalPayable") or 0), "Net amount")
        methods = payment.get("methods") if isinstance(payment.get("methods"), list) else []
        phone = str(customer.get("phone") or "").strip() or None
        order = Order(
            tenant_id=tenant_id,
            branch_id=branch_id,
            total_amount=net_amount,
            customer_phone=phone,
            customer_name=str(customer.get("name") or "").strip()[:255],
            customer_address=str(customer.get("address") or "").strip()[:500],
            discount_amount=_money(summary.get("totalDiscount") or 0, "Discount"),
            vat_amount=_money(summary.get("vat") or 0, "VAT"),
            total_paid=_money(payment.get("totalPaid") or 0, "Total paid"),
            return_amount=_money(payment.get("returnAmount") or 0, "Return amount"),
            payment_methods=methods,
        )
        session.add(order)
        await session.flush()

        for line in lines:
            session.add(
                OrderItem(
                    order_id=order.id,
                    product_id=line["product_id"],
                    variant_id=line["variant_id"],
                    quantity=line["qty"],
                    price=line["unit_price"],
                    discount=line["discount"],
                    subtotal=line["subtotal"],
                )
            )
        for product_id, quantity in product_needed.items():
            products[product_id].stock_quantity -= quantity
            session.add(products[product_id])
        for variant_id, quantity in variant_needed.items():
            variants[variant_id].stock_quantity -= quantity
            session.add(variants[variant_id])
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not save the invoice") from None
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save the invoice") from None

    invoice_id = order.id or 0
    return {"ok": True, "id": invoice_id, "invoiceId": invoice_id, "invoiceNo": f"INV{invoice_id:08d}"}
