import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AccountPublic, MediaPublic, PostPublic } from '@routism/shared';
import { api, getApiError } from '../services/api';
import { ErrorState, LoadingState } from '../components/StateBlocks';
import { useAuth } from '../hooks/useAuth';

export function ComposerPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const postId = params.get('id');
  const navigate = useNavigate();

  const [media, setMedia] = useState<MediaPublic[]>([]);
  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [timezone, setTimezone] = useState(user?.timezone || 'Asia/Kolkata');
  const [currentPost, setCurrentPost] = useState<PostPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mediaRes, accountsRes] = await Promise.all([
        api.get('/api/media'),
        api.get('/api/accounts'),
      ]);
      setMedia(mediaRes.data.data.media);
      setAccounts(accountsRes.data.data.accounts);
      if (postId) {
        const postRes = await api.get(`/api/posts/${postId}`);
        const post = postRes.data.data.post as PostPublic;
        setCurrentPost(post);
        setCaption(post.caption);
        setSelectedMediaId(post.mediaId || '');
        setTimezone(post.timezone || user?.timezone || 'Asia/Kolkata');
      }
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [postId, user?.timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedMedia = media.find((m) => m.id === selectedMediaId);
  const ig = accounts.find((a) => a.platform === 'instagram' && a.status === 'connected');

  async function ensurePost(): Promise<string> {
    if (currentPost) {
      const res = await api.patch(`/api/posts/${currentPost.id}`, {
        caption,
        mediaId: selectedMediaId,
      });
      setCurrentPost(res.data.data.post);
      return res.data.data.post.id;
    }
    const res = await api.post('/api/posts', {
      caption,
      mediaId: selectedMediaId,
    });
    setCurrentPost(res.data.data.post);
    return res.data.data.post.id;
  }

  async function saveDraft(e?: FormEvent) {
    e?.preventDefault();
    if (!selectedMediaId || !caption.trim()) {
      alert('Caption and image are required.');
      return;
    }
    setBusy(true);
    try {
      const id = await ensurePost();
      navigate(`/composer?id=${id}`);
      alert('Draft saved.');
    } catch (err) {
      alert(getApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function publishNow() {
    if (!ig) {
      alert('Connect Instagram first.');
      return;
    }
    if (!window.confirm(`Publish this post to @${ig.username}?`)) return;
    setBusy(true);
    try {
      const id = await ensurePost();
      const res = await api.post(`/api/posts/${id}/publish`);
      setCurrentPost(res.data.data.post);
      alert('Published successfully.');
      navigate('/queue');
    } catch (err) {
      alert(getApiError(err).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    if (!ig) {
      alert('Connect Instagram first.');
      return;
    }
    if (!date || !time) {
      alert('Select date and time.');
      return;
    }
    if (
      !window.confirm(
        `Schedule this post for ${date} ${time} (${timezone}) to @${ig.username}?`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const id = await ensurePost();
      const res = await api.post(`/api/posts/${id}/schedule`, { date, time, timezone });
      setCurrentPost(res.data.data.post);
      alert('Scheduled.');
      navigate('/queue');
    } catch (err) {
      alert(getApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <form onSubmit={saveDraft} className="space-y-4 rounded-xl border border-white/[0.08] bg-bg-card p-6">
        <h2 className="text-lg font-medium">Composer</h2>

        <div>
          <div className="mb-2 text-sm text-ink-muted">Image</div>
          {media.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No media yet. Upload images in the Media Library first.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {media.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMediaId(m.id)}
                  className={`overflow-hidden rounded-lg border ${
                    selectedMediaId === m.id
                      ? 'border-accent ring-1 ring-accent'
                      : 'border-white/[0.08]'
                  }`}
                >
                  <img src={m.secureUrl} alt="" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block text-sm text-ink-muted">
          Caption
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            maxLength={2200}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink outline-none focus:border-accent/40"
          />
          <div className="mt-1 text-xs">{caption.length}/2200</div>
        </label>

        <label className="block text-sm text-ink-muted">
          Instagram account
          <input
            disabled
            value={ig ? `@${ig.username}` : 'Not connected'}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink-muted"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm text-ink-muted">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm text-ink-muted">
            Time
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm text-ink-muted">
            Timezone
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-60"
          >
            Save Draft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void publishNow()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
          >
            Publish Now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void schedule()}
            className="rounded-lg border border-accent/40 px-4 py-2 text-sm text-accent hover:bg-accent/10 disabled:opacity-60"
          >
            Schedule
          </button>
        </div>
      </form>

      <aside className="rounded-xl border border-white/[0.08] bg-bg-card p-4">
        <h3 className="mb-3 text-sm font-medium text-ink-muted">Instagram preview</h3>
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black">
          <div className="flex items-center gap-2 px-3 py-2 text-sm">
            <div className="h-8 w-8 rounded-full bg-white/10" />
            <span>{ig ? ig.username : 'username'}</span>
          </div>
          {selectedMedia ? (
            <img src={selectedMedia.secureUrl} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-white/5 text-sm text-ink-muted">
              Select an image
            </div>
          )}
          <div className="space-y-1 p-3 text-sm">
            <p>
              <span className="font-medium">{ig ? ig.username : 'username'}</span>{' '}
              <span className="whitespace-pre-wrap text-ink-muted">
                {caption || 'Caption preview…'}
              </span>
            </p>
            <p className="text-xs text-ink-muted">Just now · Preview only</p>
          </div>
        </div>
        {currentPost && (
          <p className="mt-3 text-xs text-ink-muted">
            Status: {currentPost.status}
            {currentPost.errorMessage ? ` — ${currentPost.errorMessage}` : ''}
          </p>
        )}
      </aside>
    </div>
  );
}
