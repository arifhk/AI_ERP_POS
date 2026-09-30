import { useEffect, useRef } from 'react';

const SCAN_GAP_MS = 45;
const MIN_BARCODE_LENGTH = 3;

function isProtectedField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return true;
  }
  return false;
}

export function useUsbBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let buffer = '';
    let lastKeyAt = 0;

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (isProtectedField(event.target)) {
        return;
      }

      const now = performance.now();
      if (now - lastKeyAt > SCAN_GAP_MS) {
        buffer = '';
      }
      lastKeyAt = now;

      if (event.key === 'Enter') {
        if (buffer.length >= MIN_BARCODE_LENGTH) {
          event.preventDefault();
          event.stopPropagation();
          const code = buffer;
          buffer = '';
          onScanRef.current(code);
        } else {
          buffer = '';
        }
        return;
      }

      if (event.key.length === 1) {
        buffer += event.key;
        if (buffer.length > 128) {
          buffer = buffer.slice(-128);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
