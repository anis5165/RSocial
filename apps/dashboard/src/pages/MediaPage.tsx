import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { MediaPublic } from '@routism/shared';
import { api, getApiError } from '../services/api';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBlocks';
import { useAuth } from '../hooks/useAuth';
import { formatInTimezone } from '../utils/time';

export function MediaPage() {
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/media', { params: { search: search || undefined } });
      setMedia(res.data.data.media);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post('/api/media', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await load();
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this media?')) return;
    try {
      await api.delete(`/api/media/${id}`);
      await load();
    } catch (err) {
      alert(getApiError(err).message);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border border-dashed p-8 text-center transition ${
          dragOver
            ? 'border-accent bg-accent/5'
            : 'border-white/[0.12] bg-bg-card'
        }`}
      >
        <p className="text-sm text-ink-muted">
          Drag & drop a JPEG here, or{' '}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => inputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-ink-muted">JPEG/JPG only · max 8MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.target.value = '';
          }}
        />
        {uploading && <p className="mt-3 text-sm text-accent">Uploading…</p>}
      </div>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search media…"
          className="w-full max-w-sm rounded-lg border border-white/[0.08] bg-bg-card px-3 py-2 text-sm outline-none focus:border-accent/40"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/[0.08] px-3 py-2 text-sm hover:bg-white/5"
        >
          Search
        </button>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && media.length === 0 && (
        <EmptyState
          title="No media yet"
          description="Upload your first image to get started."
          action={
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
            >
              Upload your first image
            </button>
          }
        />
      )}

      {!loading && !error && media.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {media.map((m) => (
            <div
              key={m.id}
              className="overflow-hidden rounded-xl border border-white/[0.08] bg-bg-card"
            >
              <img src={m.secureUrl} alt="" className="aspect-square w-full object-cover" />
              <div className="space-y-1 p-3 text-xs text-ink-muted">
                <div>
                  {m.width}×{m.height} · {(m.fileSize / 1024).toFixed(0)} KB
                </div>
                <div>{formatInTimezone(m.createdAt, user!.timezone)}</div>
                <button
                  type="button"
                  onClick={() => void remove(m.id)}
                  className="text-red-300 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
