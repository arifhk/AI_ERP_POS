from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user
from database import get_session
from models import SystemSetting, User

router = APIRouter()

DEFAULT_VAT = 5.0


class VatSetting(SQLModel):
    default_vat: float


async def get_default_vat(session: AsyncSession) -> float:
    row = await session.get(SystemSetting, "default_vat")
    if row is None or not row.value.strip():
        return DEFAULT_VAT
    try:
        value = float(row.value)
    except ValueError:
        return DEFAULT_VAT
    return value if value >= 0 else DEFAULT_VAT


@router.get("/default-vat", response_model=VatSetting)
async def read_default_vat(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> VatSetting:
    return VatSetting(default_vat=await get_default_vat(session))


@router.put("/default-vat", response_model=VatSetting)
async def write_default_vat(
    payload: VatSetting,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> VatSetting:
    if payload.default_vat < 0 or payload.default_vat > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default VAT must be between 0 and 100",
        )
    row = await session.get(SystemSetting, "default_vat")
    if row is None:
        row = SystemSetting(key="default_vat", value=str(payload.default_vat))
    else:
        row.value = str(payload.default_vat)
    session.add(row)
    await session.commit()
    return VatSetting(default_vat=payload.default_vat)
