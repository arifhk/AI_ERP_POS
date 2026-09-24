'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Barcode from 'react-barcode';
import { formatPrice } from './ThermalReceipt';
import { printWithMode } from '../utils/print';

export type LabelProduct = {
  id: number;
  name: string;
  barcode: string;
  price: number;
};

type LabelTemplateId = '2x1-1up' | '1.5x1-1up' | '2x1-2up' | '1.25x0.75-3up' | 'custom';

type LabelTemplate = {
  id: LabelTemplateId;
  label: string;
  widthMm: number;
  heightMm: number;
  columns: number;
};

const LABEL_GAP_MM = 1;
const MAX_COPIES = 48;

const TEMPLATES: LabelTemplate[] = [
  {
    id: '2x1-1up',
    label: '2 x 1 inch retail sticker',
    widthMm: 50.8,
    heightMm: 25.4,
    columns: 1,
  },
  {
    id: '1.5x1-1up',
    label: '1.5 x 1 inch (1-up)',
    widthMm: 38.1,
    heightMm: 25.4,
    columns: 1,
  },
  {
    id: '2x1-2up',
    label: '2 x 1 inch (2-up)',
    widthMm: 50.8,
    heightMm: 25.4,
    columns: 2,
  },
  {
    id: '1.25x0.75-3up',
    label: '1.25 x 0.75 inch (3-up)',
    widthMm: 31.8,
    heightMm: 19.1,
    columns: 3,
  },
  {
    id: 'custom',
    label: 'Custom',
    widthMm: 50.8,
    heightMm: 25.4,
    columns: 1,
  },
];

const COLUMN_OPTIONS = [1, 2, 3, 4];

type LabelPrinterProps = {
  product: LabelProduct;
  onClose: () => void;
};

function roundMm(value: number) {
  return Math.round(value * 10) / 10;
}

function BarcodeLabelCard({
  name,
  barcode,
  price,
  widthMm,
  heightMm,
}: {
  name: string;
  barcode: string;
  price: number;
  widthMm: number;
  heightMm: number;
}) {
  const value = barcode.trim() || '0';
  const textBandPx = 22;
  const availableHeightPx = Math.max(18, heightMm * 3.78 - textBandPx);
  const barHeight = Math.max(16, Math.min(availableHeightPx * 0.72, 48));
  const modules = Math.max(48, value.length * 11 + 35);
  const availableWidthPx = Math.max(40, (widthMm - 1.4) * 3.78);
  const barWidth = Math.max(0.55, Math.min(1.35, availableWidthPx / modules));
  const fontSize = Math.max(7, Math.min(widthMm * 0.18, 10));

  return (
    <div
      className="barcode-label-card box-border flex flex-col items-center justify-between overflow-hidden bg-white text-black"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        padding: '0.8mm 1mm',
      }}
    >
      <div className="flex w-full flex-1 items-center justify-center overflow-hidden [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:max-w-full">
        <Barcode
          value={value}
          format="CODE128"
          width={barWidth}
          height={barHeight}
          fontSize={fontSize}
          margin={0}
          displayValue
          background="#ffffff"
          lineColor="#000000"
        />
      </div>
      <p
        className="w-full truncate text-center font-bold leading-tight"
        style={{ fontSize: `${Math.max(6, fontSize - 1)}px` }}
      >
        {name}
      </p>
      <p className="font-bold leading-none" style={{ fontSize: `${fontSize}px` }}>
        {formatPrice(price)}
      </p>
    </div>
  );
}

export function LabelPrinter({ product, onClose }: LabelPrinterProps) {
  const defaultTemplate = TEMPLATES[0];
  const [selectedTemplate, setSelectedTemplate] = useState<LabelTemplateId>(defaultTemplate.id);
  const [labelWidth, setLabelWidth] = useState(defaultTemplate.widthMm);
  const [labelHeight, setLabelHeight] = useState(defaultTemplate.heightMm);
  const [columns, setColumns] = useState(defaultTemplate.columns);
  const [printCount, setPrintCount] = useState(1);

  const barcodeValue = product.barcode.trim() || String(product.id);
  const copies = Math.min(MAX_COPIES, Math.max(1, printCount));
  const safeColumns = Math.min(4, Math.max(1, columns));
  const rows = Math.ceil(copies / safeColumns);
  const gridWidthMm = safeColumns * labelWidth + (safeColumns - 1) * LABEL_GAP_MM;
  const gridHeightMm = rows * labelHeight + (rows - 1) * LABEL_GAP_MM;

  const gridStyle = useMemo(
    () => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${safeColumns}, 1fr)`,
      gap: `${LABEL_GAP_MM}mm`,
      width: `${gridWidthMm}mm`,
    }),
    [gridWidthMm, safeColumns],
  );

  function applyTemplate(templateId: LabelTemplateId) {
    setSelectedTemplate(templateId);
    const template = TEMPLATES.find((item) => item.id === templateId);
    if (!template || template.id === 'custom') {
      return;
    }
    setLabelWidth(roundMm(template.widthMm));
    setLabelHeight(roundMm(template.heightMm));
    setColumns(template.columns);
    setPrintCount((current) => Math.max(template.columns, current));
  }

  function markCustom() {
    setSelectedTemplate('custom');
  }

  function handlePrint() {
    printWithMode('label', {
      pageWidth: `${gridWidthMm}mm`,
      pageHeight: `${gridHeightMm}mm`,
    });
  }

  const labels = Array.from({ length: copies }, (_, index) => (
    <BarcodeLabelCard
      key={`${product.id}-${index}`}
      name={product.name}
      barcode={barcodeValue}
      price={product.price}
      widthMm={labelWidth}
      heightMm={labelHeight}
    />
  ));

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-printer-title"
      >
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 id="label-printer-title" className="text-lg font-semibold text-gray-900">
                Dynamic label printer
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Live N-up preview for {product.name}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              Close
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,320px)_1fr]">
            <aside className="space-y-4 overflow-y-auto border-b border-gray-100 p-5 print:hidden lg:border-b-0 lg:border-r">
              <div>
                <label htmlFor="label-template" className="mb-1 block text-sm font-medium text-gray-700">
                  Template
                </label>
                <select
                  id="label-template"
                  value={selectedTemplate}
                  onChange={(event) => applyTemplate(event.target.value as LabelTemplateId)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="label-width" className="mb-1 block text-sm font-medium text-gray-700">
                    Width (mm)
                  </label>
                  <input
                    id="label-width"
                    type="number"
                    min="10"
                    max="120"
                    step="0.1"
                    value={labelWidth}
                    onChange={(event) => {
                      markCustom();
                      setLabelWidth(Number(event.target.value) || 10);
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="label-height" className="mb-1 block text-sm font-medium text-gray-700">
                    Height (mm)
                  </label>
                  <input
                    id="label-height"
                    type="number"
                    min="8"
                    max="80"
                    step="0.1"
                    value={labelHeight}
                    onChange={(event) => {
                      markCustom();
                      setLabelHeight(Number(event.target.value) || 8);
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="label-columns" className="mb-1 block text-sm font-medium text-gray-700">
                  Layout (Columns / N-up)
                </label>
                <select
                  id="label-columns"
                  value={safeColumns}
                  onChange={(event) => {
                    markCustom();
                    setColumns(Number(event.target.value));
                  }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {COLUMN_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count}-up ({count} column{count === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="label-copies" className="mb-1 block text-sm font-medium text-gray-700">
                  Number of copies
                </label>
                <input
                  id="label-copies"
                  type="number"
                  min="1"
                  max={MAX_COPIES}
                  step="1"
                  value={printCount}
                  onChange={(event) => setPrintCount(Number(event.target.value) || 1)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Sheet: {roundMm(gridWidthMm)} × {roundMm(gridHeightMm)} mm · {safeColumns} × {rows}{' '}
                labels
              </p>

              <button
                type="button"
                onClick={handlePrint}
                className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Print Labels
              </button>
            </aside>

            <div className="min-h-[280px] overflow-auto bg-gray-200 p-5 print:hidden">
              <div className="mx-auto w-max rounded-sm bg-white p-[1mm] shadow-sm" style={gridStyle}>
                {labels}
              </div>
            </div>
          </div>
        </div>
      </div>

      {createPortal(
        <div id="barcode-label-host" className="hidden print:block">
          <div id="label-print-grid" style={gridStyle}>
            {labels}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
