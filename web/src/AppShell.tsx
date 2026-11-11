import { PoweredBy } from './components/PoweredBy';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './components/Sidebar';
import { Icon } from './components/Icon';
import { useAuth } from './hooks/useAuth';
import { NotificationGate } from './components/NotificationGate';
import { BrandName } from './components/BrandLogo';

/** Pages d'accueil des shells (mention « propulsé par Shephr »). */
const HOME_PATHS = ['/dashboard', '/goals', '/my-goals', '/open-events'];

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
          {/* §5.5 (JP 11/11) : `shortName` du pays actif là où la place manque. */}
          <span className="mobile-topbar-title"><BrandName short /></span>
        </div>
        <Outlet />
        {/* Spec §4.5 (JP 11/11) : « propulsé par Shephr » en bas de l'accueil, pays actif seulement. */}
        {HOME_PATHS.includes(location.pathname) && <PoweredBy />}
        {/* D-WEB-06 (JP 27/10) — Parité mobile → web : rappels et campagnes à l'ouverture. */}
        <NotificationGate />
      </main>
    </div>
  );
}
