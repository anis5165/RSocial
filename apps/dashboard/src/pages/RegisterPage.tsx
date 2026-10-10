import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function RegisterPage() {
  const { register, user, loading, error } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register(name, email, password);
      navigate('/');
    } catch {
      // handled
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
        <h1 className="mt-2 text-2xl font-semibold">Create account</h1>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <label className="mt-6 block text-sm text-ink-muted">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-bg px-3 py-2 text-ink outline-none focus:border-accent/50"
          />
        </label>
        <label className="mt-4 block text-sm text-ink-muted">
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
          Password (min 8)
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
          {submitting ? 'Creating…' : 'Create account'}
        </button>
        <p className="mt-4 text-center text-sm text-ink-muted">
          Have an account?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
