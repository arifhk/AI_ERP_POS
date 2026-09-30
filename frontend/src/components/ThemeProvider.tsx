'use client';

import { useRouter } from 'next/navigation';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { setClientNavigator } from '../utils/api';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ClientNavigator />
      {children}
      <ThemedToaster />
    </NextThemesProvider>
  );
}

function ClientNavigator() {
  const router = useRouter();
  useEffect(() => {
    setClientNavigator((href) => router.push(href));
  }, [router]);
  return null;
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="top-right" richColors closeButton theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />;
}
