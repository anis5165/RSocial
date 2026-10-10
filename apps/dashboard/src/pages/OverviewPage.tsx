import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardData } from '@routism/shared';
import { api, getApiError } from '../services/api';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/StateBlocks';
import { useAuth } from '../hooks/useAuth';
import { formatInTimezone } from '../utils/time';

export function OverviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/dashboard');
      setData(res.data.data);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <EmptyState title="No dashboard data" />;

  const stats = [
    { label: 'Total Posts', value: data.statistics.totalPosts },
    { label: 'Published', value: data.statistics.published },
    { label: 'Scheduled', value: data.statistics.scheduled },
    { label: 'Failed', value: data.statistics.failed },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/[0.08] bg-bg-card p-5 transition hover:border-white/[0.14]"
          >
            <div className="text-sm text-ink-muted">{s.label}</div>
            <div className="mt-2 text-3xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-white/[0.08] bg-bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Recent posts</h2>
            <Link to="/queue" className="text-sm text-accent hover:underline">
              View queue
            </Link>
          </div>
          {data.recentPosts.length === 0 ? (
            <EmptyState
              title="No posts yet"
              description="Create your first draft."
              action={
                <Link to="/composer" className="text-accent hover:underline">
                  Open composer
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {data.recentPosts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.06] p-3"
                >
                  {p.media?.secureUrl ? (
                    <img
                      src={p.media.secureUrl}
                      alt=""
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-white/5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{p.caption}</div>
                    <div className="text-xs text-ink-muted">
                      {formatInTimezone(p.createdAt, user!.timezone)}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.08] bg-bg-card p-5">
          <h2 className="mb-4 font-medium">Upcoming scheduled</h2>
          {data.upcomingPosts.length === 0 ? (
            <p className="text-sm text-ink-muted">No upcoming scheduled posts.</p>
          ) : (
            <ul className="space-y-3">
              {data.upcomingPosts.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 text-sm">
                  <span className="truncate">{p.caption}</span>
                  <span className="shrink-0 text-ink-muted">
                    {formatInTimezone(p.scheduledAt, p.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.08] bg-bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Connected accounts</h2>
            <Link to="/accounts" className="text-sm text-accent hover:underline">
              Manage
            </Link>
          </div>
          {data.accounts.length === 0 ? (
            <p className="text-sm text-ink-muted">No accounts connected.</p>
          ) : (
            <ul className="space-y-2">
              {data.accounts.map((a) => (
                <li key={a.id} className="flex justify-between text-sm">
                  <span>
                    Instagram @{a.username}
                  </span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.08] bg-bg-card p-5">
          <h2 className="mb-4 font-medium">Recent publishing activity</h2>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-ink-muted">No delivery activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recentActivity.map((d) => (
                <li key={d.id} className="flex justify-between gap-2">
                  <span className="text-ink-muted">
                    {formatInTimezone(d.createdAt, user!.timezone)}
                  </span>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
