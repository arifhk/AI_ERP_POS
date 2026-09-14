from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user
from database import get_session
from models import Branch, Product, Tenant, User

router = APIRouter()


class ProductCreate(SQLModel):
    tenant_id: int
    name: str
    barcode: str
    price: float
    branch_id: Optional[int] = None
    stock_quantity: int = 0
    is_active: bool = True


class ProductUpdate(SQLModel):
    tenant_id: Optional[int] = None
    name: Optional[str] = None
    barcode: Optional[str] = None
    price: Optional[float] = None
    branch_id: Optional[int] = None
    stock_quantity: Optional[int] = None
    is_active: Optional[bool] = None


class ProductRead(SQLModel):
    id: int
    tenant_id: int
    branch_id: Optional[int] = None
    name: str
    barcode: str
    price: float
    stock_quantity: int
    is_active: bool
    created_at: datetime


async def _get_product(session: AsyncSession, product_id: int) -> Product:
    product = await session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


async def _validate_catalog_scope(
    session: AsyncSession,
    tenant_id: int,
    branch_id: Optional[int],
) -> None:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if branch_id is not None:
        branch = await session.get(Branch, branch_id)
        if branch is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
        if branch.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Branch does not belong to the given tenant",
            )


async def _barcode_taken(
    session: AsyncSession,
    barcode: str,
    exclude_id: Optional[int] = None,
) -> bool:
    statement = select(Product).where(Product.barcode == barcode)
    if exclude_id is not None:
        statement = statement.where(Product.id != exclude_id)
    existing = (await session.exec(statement)).first()
    return existing is not None


@router.post("/", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    session: AsyncSession = Depends(get_session),
) -> Product:
    await _validate_catalog_scope(session, payload.tenant_id, payload.branch_id)
    if await _barcode_taken(session, payload.barcode):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Barcode already exists",
        )
    product = Product.model_validate(payload)
    session.add(product)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create product",
        ) from None
    await session.refresh(product)
    return product


@router.get("/", response_model=list[ProductRead])
async def list_products(
    tenant_id: Optional[int] = Query(None),
    branch_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[Product]:
    statement = select(Product)
    if tenant_id is not None:
        statement = statement.where(Product.tenant_id == tenant_id)
    if branch_id is not None:
        statement = statement.where(Product.branch_id == branch_id)
    result = await session.exec(statement.offset(skip).limit(limit).order_by(Product.id))
    return list(result.all())


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
) -> Product:
    return await _get_product(session, product_id)


@router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    session: AsyncSession = Depends(get_session),
) -> Product:
    product = await _get_product(session, product_id)
    data = payload.model_dump(exclude_unset=True)
    next_tenant_id = data.get("tenant_id", product.tenant_id)
    next_branch_id = data.get("branch_id", product.branch_id)
    next_barcode = data.get("barcode", product.barcode)
    await _validate_catalog_scope(session, next_tenant_id, next_branch_id)
    if await _barcode_taken(session, next_barcode, exclude_id=product.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Barcode already exists",
        )
    product.sqlmodel_update(data)
    session.add(product)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not update product",
        ) from None
    await session.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
) -> None:
    product = await _get_product(session, product_id)
    await session.delete(product)
    await session.commit()
