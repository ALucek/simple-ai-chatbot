import { cn } from '@/lib/cn';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-surface-muted animate-pulse rounded-[var(--radius)]',
        className,
      )}
      {...props}
    />
  );
}
