import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login, user, loading, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      // error in context
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-bg-card p-8"
      >
        <div className="text-xs uppercase tracking-[0.2em] text-ink-muted">Routism Social</div>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Publish and schedule Instagram posts.</p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <label className="mt-6 block text-sm text-ink-muted">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink outline-none focus:border-accent/50"
          />
        </label>
        <label className="mt-4 block text-sm text-ink-muted">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink outline-none focus:border-accent/50"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-black hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-center text-sm text-ink-muted">
          No account?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Register
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-ink-muted">
          <Link to="/privacy-policy" className="hover:text-accent hover:underline">
            Privacy Policy
          </Link>
        </p>
      </form>
    </div>
  );
}
