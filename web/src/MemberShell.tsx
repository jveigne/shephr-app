import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './components/Icon';
import { contactMailto } from './constants/contact';
import { useAuth } from './hooks/useAuth';
import { setLanguage } from './i18n';

/**
 * Feature A — shell MINIMAL de l'espace membre (MEMBRE Goals rattaché à une assemblée).
 * N'expose QUE « Mes objectifs », « Réglages » et la déconnexion — aucun élargissement :
 * la garde d'AppShell (canAccessWeb / hasMinistryAccess) n'est pas touchée.
 */
export function MemberShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ready, isAuthenticated, canAccessMemberSpace, me, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [navOpen, setNavOpen] = useState(false);
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || !canAccessMemberSpace) {
      navigate('/login', { replace: true });
    }
  }, [ready, isAuthenticated, canAccessMemberSpace, navigate]);

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

  if (!isAuthenticated || !canAccessMemberSpace) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const initials = (me?.fullName ?? 'A·')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <span className="grain-overlay" />
        <div className="sidebar-inner">
          <div className="brand">
            <div className="brand-mark">S</div>
            <div className="brand-text">
              <span className="word">shephr</span>
              <span className="sub">{t('memberGoals.spaceLabel')}</span>
            </div>
          </div>

          <nav className="nav">
            <div>
              <NavLink
                to="/my-goals"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon name="sparkle" size={18} />
                <span>{t('memberGoals.title')}</span>
              </NavLink>
              <NavLink
                to="/member-settings"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon name="settings" size={18} />
                <span>{t('settings.title')}</span>
              </NavLink>
            </div>
            {/* Contact : même point d'entrée que dans l'espace ministère. */}
            <div>
              <a className="nav-item" href={contactMailto(t('nav.contactSubject'))}>
                <Icon name="mail" size={18} />
                <span>{t('nav.contact')}</span>
              </a>
            </div>
          </nav>

          <div className="sidebar-foot">
            <div className="avatar">{initials || 'A'}</div>
            <div className="who">
              <div className="nm">{me?.fullName ?? '—'}</div>
              <div className="rl">
                {t('roles.MEMBRE')}
                <span style={{ marginLeft: 6, display: 'inline-flex', gap: 2, fontSize: 10, fontWeight: 600 }}>
                  {(['fr', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLanguage(l)}
                      title={t('nav.language')}
                      style={{
                        padding: '0 5px',
                        borderRadius: 6,
                        border: '1px solid currentColor',
                        background: lang === l ? 'currentColor' : 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        opacity: lang === l ? 1 : 0.55,
                        fontWeight: lang === l ? 700 : 600,
                      }}
                    >
                      <span style={{ color: lang === l ? 'var(--green-800, #14241C)' : 'inherit' }}>
                        {l.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </span>
              </div>
              {me?.unitNames && me.unitNames.length > 0 ? (
                <div className="rl" style={{ opacity: 0.7 }}>
                  {t('sidebar.units', { count: me.unitNames.length })} : {me.unitNames.join(', ')}
                </div>
              ) : null}
              {me?.leaderName ? (
                <div className="rl" style={{ opacity: 0.7 }}>{t('sidebar.leader')} : {me.leaderName}</div>
              ) : null}
            </div>
            <button className="logout" onClick={handleLogout} title={t('sidebar.logout')}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>
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
