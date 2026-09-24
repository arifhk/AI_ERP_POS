'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
];

export function PosCameraScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let stopped = false;

    async function start() {
      const instance = new Html5Qrcode('pos-camera-reader', {
        formatsToSupport: FORMATS,
        verbose: false,
      });
      scanner = instance;
      await instance.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (width, height) => ({
            width: Math.max(140, Math.min(width * 0.85, 280)),
            height: Math.max(80, Math.min(height * 0.35, 140)),
          }),
        },
        (decoded) => {
          if (stopped) {
            return;
          }
          stopped = true;
          const code = decoded.trim();
          void instance.stop().catch(() => undefined);
          if (code) {
            onScanRef.current(code);
          }
        },
        () => undefined,
      );
    }

    start().catch(() => {
      if (!stopped) {
        setCameraError('Camera access was blocked or no camera is available.');
      }
    });

    return () => {
      stopped = true;
      if (scanner?.isScanning) {
        void scanner.stop().catch(() => undefined);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Scan with camera</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
        <div id="pos-camera-reader" className="min-h-64 bg-black" />
        {cameraError ? <p className="px-4 py-3 text-sm text-red-700">{cameraError}</p> : null}
      </div>
    </div>
  );
}
