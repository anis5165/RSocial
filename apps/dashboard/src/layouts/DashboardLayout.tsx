import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { nowLabel } from '../utils/time';
import { useEffect, useState } from 'react';

const nav = [
  { to: '/', label: 'Overview', end: true },
  { to: '/queue', label: 'Publishing Queue' },
  { to: '/composer', label: 'Composer' },
  { to: '/media', label: 'Media Library' },
  { to: '/accounts', label: 'Connected Accounts' },
  { to: '/settings', label: 'Settings' },
];

const titles: Record<string, string> = {
  '/': 'Overview',
  '/queue': 'Publishing Queue',
  '/composer': 'Composer',
  '/media': 'Media Library',
  '/accounts': 'Connected Accounts',
  '/settings': 'Settings',
};

export function DashboardLayout() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clock, setClock] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const tick = () => setClock(nowLabel(user.timezone));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-ink-muted">
        Loading…
      </div>
    );
  }

  const title = titles[location.pathname] || 'Routism Social';

  return (
    <div className="flex min-h-screen bg-bg">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-white/[0.08] bg-bg-soft transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-white/[0.08] px-5 py-5">
          <div className="text-xs uppercase tracking-[0.2em] text-ink-muted">Routism</div>
          <div className="mt-1 text-xl font-semibold text-ink">
            Social <span className="text-accent">.</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-ink-muted hover:bg-white/5 hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/[0.08] p-4">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-ink-muted">{user.email}</div>
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/login'))}
            className="mt-3 w-full rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-ink-muted hover:bg-white/5 hover:text-ink"
          >
            Logout
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.08] bg-bg/90 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-white/[0.08] px-2 py-1 text-sm lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              Menu
            </button>
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-ink-muted">
            <span className="hidden sm:inline">{clock}</span>
            <span className="rounded-full border border-white/[0.08] px-2 py-1 text-xs">
              ● Live
            </span>
            <span className="hidden md:inline">{user.name}</span>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
