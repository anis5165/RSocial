import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { SettingsPublic } from '@routism/shared';
import { api, getApiError } from '../services/api';
import { ErrorState, LoadingState } from '../components/StateBlocks';
import { useAuth } from '../hooks/useAuth';

export function SettingsPage() {
  const { refresh } = useAuth();
  const [settings, setSettings] = useState<SettingsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/settings');
      const s = res.data.data.settings as SettingsPublic;
      setSettings(s);
      setName(s.account.name);
      setTimezone(s.account.timezone);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch('/api/settings', { name, timezone });
      setSettings(res.data.data.settings);
      await refresh();
      setSaved(true);
    } catch (err) {
      alert(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!settings) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form
        onSubmit={onSave}
        className="space-y-4 rounded-xl border border-white/[0.08] bg-bg-card p-6"
      >
        <h2 className="text-lg font-medium">Account</h2>
        <label className="block text-sm text-ink-muted">
          Email
          <input
            disabled
            value={settings.account.email}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink-muted"
          />
        </label>
        <label className="block text-sm text-ink-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink outline-none focus:border-accent/40"
          />
        </label>
        <label className="block text-sm text-ink-muted">
          Timezone
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Asia/Kolkata"
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink outline-none focus:border-accent/40"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="ml-3 text-sm text-emerald-300">Saved</span>}
      </form>

      <section className="rounded-xl border border-white/[0.08] bg-bg-card p-6">
        <h2 className="text-lg font-medium">Instagram configuration</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Status</dt>
            <dd>{settings.instagram.connected ? 'Connected' : 'Not connected'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Username</dt>
            <dd>{settings.instagram.username ? `@${settings.instagram.username}` : '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Token status</dt>
            <dd>{settings.instagram.tokenStatus || '—'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          App credentials are configured server-side only and never exposed here.
        </p>
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-bg-card p-6">
        <h2 className="text-lg font-medium">Cloudinary configuration</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Status</dt>
            <dd>{settings.cloudinary.connected ? 'Connected' : 'Not configured'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Cloud name</dt>
            <dd>{settings.cloudinary.cloudNameMasked || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Upload preset</dt>
            <dd>{settings.cloudinary.uploadPresetMasked}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          Unsigned uploads (no API key/secret). Delivery uses res.cloudinary.com.
        </p>
      </section>
    </div>
  );
}
