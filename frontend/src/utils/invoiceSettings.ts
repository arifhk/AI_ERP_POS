export const INVOICE_SETTINGS_KEY = 'company_invoice_settings';

export const PAPER_SIZES = ['80mm POS', 'A4', 'A5'] as const;

export type PaperSize = (typeof PAPER_SIZES)[number];

export type CompanyInvoiceSettings = {
  companyName: string;
  logoData: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  paperSize: PaperSize;
  headerNote: string;
  footerNote: string;
  returnPolicy: string;
};

export const DEFAULT_INVOICE_SETTINGS: CompanyInvoiceSettings = {
  companyName: 'Plus Point',
  logoData: '',
  address: '',
  phone: '',
  email: '',
  website: 'www.pluspoint.com.bd',
  taxId: '',
  paperSize: '80mm POS',
  headerNote: '',
  footerNote: 'Thank you for shopping with us.',
  returnPolicy: 'Exchanges within 10 days.\nNo cash refunds.\nOriginal tag is required.\nNo exchange on accessories or discounted items.',
};

export type InvoiceSettingsPayload = {
  company_name?: string;
  logo_data?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  tax_id?: string;
  paper_size?: string;
  header_note?: string;
  footer_note?: string;
  return_policy?: string;
  configured?: boolean;
};

function asPaperSize(value: string | undefined): PaperSize {
  return PAPER_SIZES.includes(value as PaperSize) ? (value as PaperSize) : DEFAULT_INVOICE_SETTINGS.paperSize;
}

export function readInvoiceSettings(): CompanyInvoiceSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_INVOICE_SETTINGS;
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(INVOICE_SETTINGS_KEY) || 'null') as Partial<CompanyInvoiceSettings> | null;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_INVOICE_SETTINGS;
    }
    return {
      ...DEFAULT_INVOICE_SETTINGS,
      ...parsed,
      paperSize: asPaperSize(parsed.paperSize),
      logoData: typeof parsed.logoData === 'string' ? parsed.logoData : '',
    };
  } catch {
    return DEFAULT_INVOICE_SETTINGS;
  }
}

export function writeInvoiceSettings(settings: CompanyInvoiceSettings) {
  localStorage.setItem(INVOICE_SETTINGS_KEY, JSON.stringify(settings));
}

export function fromInvoicePayload(payload: InvoiceSettingsPayload): CompanyInvoiceSettings {
  return {
    companyName: payload.company_name?.trim() || DEFAULT_INVOICE_SETTINGS.companyName,
    logoData: payload.logo_data || '',
    address: payload.address?.trim() || '',
    phone: payload.phone?.trim() || '',
    email: payload.email?.trim() || '',
    website: payload.website?.trim() || DEFAULT_INVOICE_SETTINGS.website,
    taxId: payload.tax_id?.trim() || '',
    paperSize: asPaperSize(payload.paper_size),
    headerNote: payload.header_note?.trim() || '',
    footerNote: payload.footer_note?.trim() || DEFAULT_INVOICE_SETTINGS.footerNote,
    returnPolicy: payload.return_policy?.trim() || DEFAULT_INVOICE_SETTINGS.returnPolicy,
  };
}

export function toInvoicePayload(settings: CompanyInvoiceSettings): InvoiceSettingsPayload {
  return {
    company_name: settings.companyName,
    logo_data: settings.logoData,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    tax_id: settings.taxId,
    paper_size: settings.paperSize,
    header_note: settings.headerNote,
    footer_note: settings.footerNote,
    return_policy: settings.returnPolicy,
  };
}
