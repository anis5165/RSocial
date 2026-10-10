import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PostPublic, PostStatus } from '@routism/shared';
import { api, getApiError } from '../services/api';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/StateBlocks';
import { useAuth } from '../hooks/useAuth';
import { formatInTimezone } from '../utils/time';

const tabs: Array<PostStatus | 'all'> = [
  'all',
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'needs_review',
];

export function QueuePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PostStatus | 'all'>('all');
  const [posts, setPosts] = useState<PostPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/posts', { params: { status: tab } });
      setPosts(res.data.data.posts);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(postId: string, path: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(postId);
    try {
      await api.post(`/api/posts/${postId}/${path}`);
      await load();
    } catch (err) {
      alert(getApiError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              tab === t
                ? 'bg-accent text-black'
                : 'border border-white/[0.08] text-ink-muted hover:bg-white/5'
            }`}
          >
            {t.replace('_', ' ')}
          </button>
        ))}
        <Link
          to="/composer"
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-black"
        >
          New post
        </Link>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && posts.length === 0 && (
        <EmptyState
          title="No posts in this queue"
          action={
            <Link to="/composer" className="text-accent hover:underline">
              Create a post
            </Link>
          }
        />
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-bg-panel text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Post</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Scheduled</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-t border-white/[0.06]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.media?.secureUrl ? (
                        <img
                          src={p.media.secureUrl}
                          alt=""
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-white/5" />
                      )}
                      <div className="max-w-xs truncate">{p.caption}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                    {p.errorMessage && (
                      <div className="mt-1 max-w-[200px] truncate text-xs text-red-300">
                        {p.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatInTimezone(p.scheduledAt, p.timezone || user!.timezone)}
                  </td>
                  <td className="px-4 py-3">Instagram</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatInTimezone(p.createdAt, user!.timezone)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Link
                        to={`/composer?id=${p.id}`}
                        className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                      >
                        View
                      </Link>
                      {['draft', 'scheduled', 'failed', 'needs_review'].includes(p.status) && (
                        <Link
                          to={`/composer?id=${p.id}`}
                          className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                        >
                          Edit
                        </Link>
                      )}
                      {['draft', 'failed', 'needs_review'].includes(p.status) && (
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() =>
                            void action(
                              p.id,
                              'publish',
                              'Publish this post to Instagram now?'
                            )
                          }
                          className="rounded border border-accent/40 px-2 py-1 text-xs text-accent hover:bg-accent/10"
                        >
                          Publish
                        </button>
                      )}
                      {p.status === 'scheduled' && (
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => void action(p.id, 'cancel')}
                          className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      )}
                      {['failed', 'needs_review'].includes(p.status) && (
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => void action(p.id, 'retry', 'Retry publishing this post?')}
                          className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
