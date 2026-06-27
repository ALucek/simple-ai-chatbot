'use client';

import { useToast } from '@/lib/toast-context';

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="border-border bg-surface text-fg flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2 text-sm shadow-sm"
        >
          <span>{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-muted hover:text-fg"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
