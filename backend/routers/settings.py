from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from auth import get_current_user
from database import get_session
from models import CompanyInvoiceSetting, SystemSetting, User
from rbac import require_company_editor, write_tenant

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


class InvoiceSettingsBody(SQLModel):
    company_name: str = "Plus Point"
    logo_data: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    website: str = "www.pluspoint.com.bd"
    tax_id: str = ""
    paper_size: str = "80mm POS"
    header_note: str = ""
    footer_note: str = "Thank you for shopping with us."
    return_policy: str = "Exchanges within 10 days.\nNo cash refunds.\nOriginal tag is required.\nNo exchange on accessories or discounted items."
    configured: bool = False


def _blank_invoice_settings(tenant_id: int) -> CompanyInvoiceSetting:
    defaults = InvoiceSettingsBody().model_dump(exclude={"configured"})
    return CompanyInvoiceSetting(tenant_id=tenant_id, **defaults)


def _as_body(row: CompanyInvoiceSetting) -> InvoiceSettingsBody:
    return InvoiceSettingsBody.model_validate(row, from_attributes=True)


@router.get("/invoice", response_model=InvoiceSettingsBody)
async def read_invoice_settings(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> InvoiceSettingsBody:
    tenant_id = write_tenant(current_user, current_user.tenant_id)
    row = await session.get(CompanyInvoiceSetting, tenant_id)
    if row is None:
        return InvoiceSettingsBody()
    body = _as_body(row)
    body.configured = True
    return body


@router.put("/invoice", response_model=InvoiceSettingsBody)
async def write_invoice_settings(
    payload: InvoiceSettingsBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> InvoiceSettingsBody:
    require_company_editor(current_user)
    if payload.paper_size not in {"80mm POS", "A4", "A5"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paper size must be 80mm POS, A4, or A5")
    if len(payload.logo_data) > 700_000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Logo is too large. Use an image under 500 KB.")
    tenant_id = write_tenant(current_user, current_user.tenant_id)
    row = await session.get(CompanyInvoiceSetting, tenant_id)
    if row is None:
        row = _blank_invoice_settings(tenant_id)
    data = payload.model_dump(exclude={"configured"})
    for key, value in data.items():
        setattr(row, key, value.strip() if isinstance(value, str) and key != "logo_data" else value)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    body = _as_body(row)
    body.configured = True
    return body
