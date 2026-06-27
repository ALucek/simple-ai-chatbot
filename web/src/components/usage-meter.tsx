'use client';

import type { CSSProperties } from 'react';
import { useUsage } from '@/lib/usage-context';

export function UsageMeter() {
  const { used, budget } = useUsage();
  if (used === null || budget === null) return null;

  const pct =
    budget > 0
      ? Math.min(100, Math.max(0, Math.round((used / budget) * 100)))
      : 0;
  const warn = pct >= 90;

  return (
    <div
      className="usage"
      title={`${used.toLocaleString()} / ${budget.toLocaleString()} tokens`}
    >
      <span
        className={warn ? 'usage-donut warn' : 'usage-donut'}
        style={{ '--pct': pct } as CSSProperties}
        aria-hidden="true"
      />
      <span className={warn ? 'usage-pct warn' : 'usage-pct'}>{pct}%</span>
    </div>
  );
}
