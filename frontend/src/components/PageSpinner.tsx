export function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-gray-100 bg-white p-16 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
    </div>
  );
}
