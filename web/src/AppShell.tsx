import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { useAuth } from './hooks/useAuth';

export function AppShell() {
  const navigate = useNavigate();
  const { ready, isAuthenticated, isAdmin } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
    } else if (!isAdmin) {
      navigate('/login', { replace: true });
    }
  }, [ready, isAuthenticated, isAdmin, navigate]);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--ink-500)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Chargement…
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) return null;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
