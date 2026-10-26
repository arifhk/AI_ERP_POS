'use client';

import dynamic from 'next/dynamic';

export const PosCameraScanner = dynamic(
  () => import('./PosCameraScanner').then((mod) => mod.PosCameraScanner),
  { ssr: false },
);
