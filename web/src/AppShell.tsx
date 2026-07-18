import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './components/Sidebar';
import { Icon } from './components/Icon';
import { useAuth } from './hooks/useAuth';

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ready, isAuthenticated, canAccessWeb } = useAuth();
  const { t } = useTranslation();
  // Mobile : la sidebar devient un tiroir (fermé par défaut, ouvert via le hamburger).
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || !canAccessWeb) {
      navigate('/login', { replace: true });
    }
  }, [ready, isAuthenticated, canAccessWeb, navigate]);

  // Fermer le tiroir à chaque navigation (mobile).
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

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
        {t('common.loading')}
      </div>
    );
  }

  if (!isAuthenticated || !canAccessWeb) return null;

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <main className="main">
        <div className="mobile-topbar">
          <button
            type="button"
            className="nav-burger"
            aria-label={t('nav.menu', 'Menu')}
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon name="menu" size={20} />
          </button>
          <span className="mobile-topbar-title">Shephr</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
