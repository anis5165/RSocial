import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AccountPublic } from '@routism/shared';
import { api, getApiError } from '../services/api';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/StateBlocks';
import { useAuth } from '../hooks/useAuth';
import { formatInTimezone } from '../utils/time';

export function AccountsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const bannerError = params.get('error');
  const connected = params.get('connected');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/accounts');
      setAccounts(res.data.data.accounts);
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setConnecting(true);
    try {
      const res = await api.get('/api/accounts/instagram/connect');
      window.location.href = res.data.data.url;
    } catch (err) {
      alert(getApiError(err).message);
      setConnecting(false);
    }
  }

  async function disconnect(id: string) {
    if (!window.confirm('Disconnect this Instagram account?')) return;
    try {
      await api.delete(`/api/accounts/${id}`);
      await load();
    } catch (err) {
      alert(getApiError(err).message);
    }
  }

  const ig = accounts.find((a) => a.platform === 'instagram' && a.status === 'connected');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {connected && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Instagram connected successfully.
        </div>
      )}
      {bannerError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {bannerError}
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && (
        <div className="rounded-xl border border-white/[0.08] bg-bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Instagram</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Professional account via Meta Graph API
              </p>
            </div>
            {ig ? <StatusBadge status="connected" /> : <StatusBadge status="disconnected" />}
          </div>

          {ig ? (
            <div className="mt-6 space-y-2 text-sm">
              <div>
                <span className="text-ink-muted">Username: </span>@{ig.username}
              </div>
              <div>
                <span className="text-ink-muted">Display name: </span>
                {ig.displayName || '—'}
              </div>
              <div>
                <span className="text-ink-muted">Token status: </span>
                {ig.tokenExpiresAt
                  ? `Expires ${formatInTimezone(ig.tokenExpiresAt, user!.timezone)}`
                  : 'Unknown'}
              </div>
              <div>
                <span className="text-ink-muted">Connected: </span>
                {formatInTimezone(ig.createdAt, user!.timezone)}
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => void disconnect(ig.id)}
                  className="rounded-lg border border-white/[0.08] px-3 py-2 text-sm hover:bg-white/5"
                >
                  Disconnect
                </button>
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => void connect()}
                  className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent hover:bg-accent/10"
                >
                  Reconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState
                title="Instagram not connected"
                description="Connect a professional Instagram account linked to a Facebook Page."
                action={
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={() => void connect()}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                  >
                    {connecting ? 'Redirecting…' : 'Connect Instagram'}
                  </button>
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
