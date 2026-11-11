import { PoweredBy } from './components/PoweredBy';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from './components/Icon';
import { FEATURES } from './config/features';
import { getAccessibleModules, isAttachedAccount, isUnattachedPerson } from './services/authApi';
import { useAuth } from './hooks/useAuth';
import { NotificationGate } from './components/NotificationGate';
import { setLanguage } from './i18n';
import { MySubscriptionsLink } from './components/MySubscriptionsLink';
import { StudyLiveBadge } from './components/StudyLiveBadge';
import { useStudyAccess, useStudyMenuVisible } from './utils/studyAccess';
import { BrandLogo, BrandName } from './components/BrandLogo';

/**
 * Feature A — shell MINIMAL de l'espace membre (MEMBRE Goals rattaché à une assemblée).
 * N'expose QUE « Mes objectifs », « Mon assemblée » (D-ASM-17, lecture seule, si l'abonnement
 * ASSEMBLY couvre le membre), « Mes actions » (lot E8 ; D-EVT-14 JP 14/10 : vue dédiée, les
 * actions de SON assemblée seulement — compteur, programmés, réalisés, Déclarer / Programmer — si
 * l'abonnement EVENTS le couvre, D-EVT-05), « Le Message de Bertoua » (D-ETU-31 JP 23/10, si
 * l'abonnement STUDY le couvre), « Documents » (D-WEB-03 JP 27/10, si l'abonnement DOCUMENTS le
 * couvre), « Réglages » et la déconnexion — aucun élargissement :
 * la garde d'AppShell (canAccessWeb / hasMinistryAccess) n'est pas touchée.
 */
/** Pages d'accueil des shells (mention « propulsé par Shephr »). */
const HOME_PATHS = ['/dashboard', '/goals', '/my-goals', '/open-events'];

export function MemberShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ready, isAuthenticated, canAccessMemberSpace, me, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [navOpen, setNavOpen] = useState(false);
  const modulesQ = useQuery({
    queryKey: ['accessible-modules'],
    queryFn: getAccessibleModules,
    enabled: ready && isAuthenticated && canAccessMemberSpace,
  });
  const hasAssembly = FEATURES.assembly && (modulesQ.data ?? []).includes('ASSEMBLY');
  const hasEvents = FEATURES.events && (modulesQ.data ?? []).includes('EVENTS');
  // D-ETU-28 / D-ETU-31 (JP 23/10) : « Le Message de Bertoua » = abonnement STUDY + FEATURES.study.
  // D-WEB-02 (JP 27/10) : décision centralisée dans `useStudyAccess`.
  const { hasStudy } = useStudyAccess({ enabled: ready && isAuthenticated && canAccessMemberSpace });
  // D-ETU-54 (JP 27/10) : entrée de menu seulement si `/study/catalog` est non vide (tuile mobile).
  const showStudy = useStudyMenuVisible(hasStudy);
  // D-DOC-14 levée (JP 27/10, D-WEB-03) : « Documents » = abonnement DOCUMENTS ET compte rattaché.
  const hasDocuments = (modulesQ.data ?? []).includes('DOCUMENTS') && isAttachedAccount(me);
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';
  // RG-PAYS-22 (JP 11/11, contrat §10.3) : compte « sans assemblée » — seules les routes ci-dessous lui sont
  // ouvertes ; toute autre route du shell le renvoie sur les évènements ouverts (garde par chemin).
  const unattached = isUnattachedPerson(me);
  const UNATTACHED_PATHS = ['/open-events', '/member-settings', '/member-contact'];
  const pathAllowed = !unattached || UNATTACHED_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || !canAccessMemberSpace) {
      navigate('/login', { replace: true });
      return;
    }
    if (!pathAllowed) navigate('/open-events', { replace: true });
  }, [ready, isAuthenticated, canAccessMemberSpace, pathAllowed, navigate]);

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

  if (!isAuthenticated || !canAccessMemberSpace || !pathAllowed) return null;

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
            {/* D-PAYS-03 / §5.5 (JP 11/11) : logo et nom du pays actif, sinon Shephr. */}
            <BrandLogo />
            <div className="brand-text">
              <span className="word"><BrandName /></span>
              <span className="sub">{t('memberGoals.spaceLabel')}</span>
            </div>
          </div>

          <nav className="nav">
            <div>
              {!unattached && (
              <NavLink
                to="/my-goals"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon name="sparkle" size={18} />
                <span>{t('memberGoals.title')}</span>
              </NavLink>
              )}
              {hasAssembly && !unattached && (
                <NavLink
                  to="/my-assembly"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name="calendar" size={18} />
                  <span>{t('assembly.memberNav')}</span>
                </NavLink>
              )}
              {showStudy && !unattached && (
                <NavLink
                  to="/my-study"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name="edit" size={18} />
                  <span>{t('nav.study')}</span>
                  <StudyLiveBadge enabled={showStudy} />
                </NavLink>
              )}
              {hasEvents && !unattached && (
                <NavLink
                  to="/my-actions"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name="megaphone" size={18} />
                  <span>{t('events.member.title')}</span>
                </NavLink>
              )}
              {/* RG-PAYS-24 (JP 11/11) : évènements ouverts à tous de mon pays et de ma ville — seule entrée
                  métier d'un compte sans assemblée, en plus pour un membre rattaché. */}
              {(hasEvents || (unattached && FEATURES.events)) && (
                <NavLink
                  to="/open-events"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name="calendar" size={18} />
                  <span>{t('nav.openEvents')}</span>
                </NavLink>
              )}
              {hasDocuments && !unattached && (
                <NavLink
                  to="/my-documents"
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name="fileText" size={18} />
                  <span>{t('nav.documents')}</span>
                </NavLink>
              )}
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
              <NavLink
                to="/member-contact"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon name="mail" size={18} />
                <span>{t('nav.contact')}</span>
              </NavLink>
            </div>
          </nav>

          <div className="sidebar-foot">
            <div className="avatar">{initials || 'A'}</div>
            <div className="who">
              <div className="nm">{me?.fullName ?? '—'}</div>
              <div className="rl">
                {unattached ? t('nav.noAssemblyRole') : t('roles.MEMBRE')}
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
                      <span style={{ color: lang === l ? 'var(--green-800)' : 'inherit' }}>
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
              <MySubscriptionsLink />
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
