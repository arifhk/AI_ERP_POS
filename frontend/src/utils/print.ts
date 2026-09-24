export type PrintMode = 'receipt' | 'label' | 'a4';

type LabelPrintOptions = {
  pageWidth: string;
  pageHeight: string;
};

export function printWithMode(mode: PrintMode, options?: LabelPrintOptions) {
  const existing = document.querySelectorAll('style[data-print-mode]');
  existing.forEach((node) => node.remove());

  const style = document.createElement('style');
  style.setAttribute('data-print-mode', mode);
  if (mode === 'label') {
    const width = options?.pageWidth ?? '50.8mm';
    const height = options?.pageHeight ?? '25.4mm';
    style.textContent = `@page { size: ${width} ${height}; margin: 0; }`;
  } else if (mode === 'a4') {
    style.textContent = '@page { size: A4; margin: 12mm; }';
  } else {
    style.textContent = '@page { size: 80mm auto; margin: 0; }';
  }
  document.head.appendChild(style);

  const cleanup = () => {
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
