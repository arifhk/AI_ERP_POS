'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

const OPTIONS = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'dark', label: 'Dark', icon: Moon },
] as const;

export function ThemeSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const activeIndex = Math.max(0, OPTIONS.findIndex((option) => option.id === (ready ? theme : 'system')));

  return (
    <div
      className={`relative flex items-center justify-between rounded-full bg-gray-100 p-1 dark:bg-slate-800 ${collapsed ? 'w-10 flex-col' : 'w-full'}`}
      role="group"
      aria-label="Color theme"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-full bg-white shadow-sm transition-transform duration-200 ease-out dark:bg-slate-700"
        style={
          collapsed
            ? {
                left: 4,
                top: 4,
                width: 'calc(100% - 8px)',
                height: 'calc((100% - 8px) / 3)',
                transform: `translateY(${activeIndex * 100}%)`,
              }
            : {
                left: 4,
                top: 4,
                height: 'calc(100% - 8px)',
                width: 'calc((100% - 8px) / 3)',
                transform: `translateX(${activeIndex * 100}%)`,
              }
        }
      />
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = ready && theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            title={option.label}
            onClick={() => setTheme(option.id)}
            className={`relative z-10 inline-flex h-8 flex-1 items-center justify-center rounded-full transition ${
              selected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-400'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
