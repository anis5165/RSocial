import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-bg-card p-8 text-ink-muted">
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
      <p className="text-red-200">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.12] bg-bg-card p-10 text-center">
      <h3 className="text-lg font-medium text-ink">{title}</h3>
      {description && <p className="mt-2 text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-white/10 text-ink-muted',
    scheduled: 'bg-sky-500/15 text-sky-200',
    publishing: 'bg-amber-500/15 text-amber-200',
    published: 'bg-emerald-500/15 text-emerald-200',
    failed: 'bg-red-500/15 text-red-200',
    needs_review: 'bg-orange-500/15 text-orange-200',
  };
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
        colors[status] || 'bg-white/10 text-ink-muted'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
