import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { useAuth } from '../hooks/useAuth';
import { getAccessibleModules, primaryRoleKey } from '../services/authApi';
import { FEATURES } from '../config/features';
import { setLanguage } from '../i18n';

interface NavChild {
  id: string;
  labelKey: string;
  to: string;
}

interface NavItem {
  id: string;
  labelKey: string;
  to?: string;
  icon: string;
  children?: NavChild[];
}

// Livraison « Goals only » (décision JP 2026-06-10) : les entrées Dons
// (Tableau de bord, Dons, Exports) sont masquées tant que FEATURES.donations=false.
const NAV: { sectionKey: string; items: NavItem[] }[] = [
  {
    sectionKey: 'nav.section.pilotage',
    items: [
      ...(FEATURES.donations
        ? [
            { id: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', to: '/dashboard' },
            { id: 'donations', labelKey: 'nav.donations', icon: 'donation', to: '/donations' },
          ]
        : []),
      { id: 'goals', labelKey: 'nav.goals', icon: 'sparkle', to: '/goals' },
    ],
  },
  {
    sectionKey: 'nav.section.organisation',
    items: [
      {
        id: 'structure',
        labelKey: 'nav.structure',
        icon: 'building',
        children: [
          { id: 'ministeres', labelKey: 'nav.ministeres', to: '/structure/ministeres' },
          { id: 'zones', labelKey: 'nav.zones', to: '/structure/zones' },
          { id: 'localites', labelKey: 'nav.localites', to: '/structure/localites' },
          { id: 'unites', labelKey: 'nav.unites', to: '/structure/unites' },
        ],
      },
      { id: 'users', labelKey: 'nav.users', icon: 'users', to: '/users' },
      { id: 'hierarchy', labelKey: 'nav.hierarchy', icon: 'hierarchy', to: '/hierarchy' },
    ],
  },
  {
    sectionKey: 'nav.section.systeme',
    items: [
      ...(FEATURES.donations
        ? [{ id: 'exports', labelKey: 'nav.exports', icon: 'export', to: '/exports' }]
        : []),
      { id: 'settings', labelKey: 'nav.settings', icon: 'settings', to: '/settings' },
    ],
  },
];

export function Sidebar() {
  const { me, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [structureOpen, setStructureOpen] = useState(
    location.pathname.startsWith('/structure'),
  );
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    if (location.pathname.startsWith('/structure')) setStructureOpen(true);
  }, [location.pathname]);

  // RG-06 : un module non activé est invisible. On affiche « Suivi pastoral » seulement si
  // MEMBER_CARE est accessible (gratuit/activé OU abonnement actif couvrant le user).
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const hasMemberCare = (modulesQ.data ?? []).includes('MEMBER_CARE');

  const nav = useMemo(() => {
    if (!hasMemberCare) return NAV;
    return NAV.map((sec) =>
      sec.sectionKey === 'nav.section.pilotage'
        ? { ...sec, items: [...sec.items, { id: 'member-care', labelKey: 'nav.memberCare', icon: 'users', to: '/member-care' }] }
        : sec,
    );
  }, [hasMemberCare]);

  const initials = (me?.fullName ?? 'A·')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  // Lot 2.1 — consommation des champs enrichis du /me (langue, dirigeant, date d'inscription).
  const registered = me?.registeredAt ? new Date(me.registeredAt) : null;
  const registeredValid = registered != null && !Number.isNaN(registered.getTime());
  const dateLocale = lang === 'en' ? 'en-GB' : 'fr-FR';
  const registeredSince = registeredValid
    ? registered!.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })
    : null;
  const registeredTitle = registeredValid
    ? t('sidebar.registeredOn', {
        date: registered!.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }),
      })
    : undefined;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar">
      <span className="grain-overlay" />
      <div className="sidebar-inner">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div className="brand-text">
            <span className="word">shephr</span>
            <span className="sub">{t('common.administration')}</span>
          </div>
        </div>

        <nav className="nav">
          {nav.map(({ sectionKey, items }) => (
            <div key={sectionKey}>
              <div className="nav-section-label">{t(sectionKey)}</div>
              {items.map((item) => {
                if (item.children) {
                  const childActive = item.children.some((c) =>
                    location.pathname.startsWith(c.to),
                  );
                  return (
                    <div key={item.id}>
                      <button
                        className={`nav-item ${structureOpen ? 'expanded' : ''} ${childActive ? 'active' : ''}`}
                        onClick={() => setStructureOpen((v) => !v)}
                      >
                        <Icon name={item.icon} size={18} />
                        <span>{t(item.labelKey)}</span>
                        <Icon name="chevRight" size={13} className="chev" />
                      </button>
                      {structureOpen && (
                        <div className="nav-sub">
                          {item.children.map((c) => (
                            <NavLink
                              key={c.id}
                              to={c.to}
                              className={({ isActive }) =>
                                `nav-item ${isActive ? 'active' : ''}`
                              }
                            >
                              <span style={{ width: 4 }} />
                              <span>{t(c.labelKey)}</span>
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <NavLink
                    key={item.id}
                    to={item.to!}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{t(item.labelKey)}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="avatar">{initials || 'A'}</div>
          <div className="who">
            <div className="nm" title={registeredTitle}>{me?.fullName ?? '—'}</div>
            <div className="rl">
              {(() => {
                const rk = primaryRoleKey(me);
                return rk ? t(`roles.${rk}`) : '';
              })()}
              <span
                style={{
                  marginLeft: 6,
                  display: 'inline-flex',
                  gap: 2,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
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
            {me?.zoneNames && me.zoneNames.length > 0 ? (
              <div className="rl" style={{ opacity: 0.7 }}>
                {t('sidebar.zonesLabel', { count: me.zoneNames.length })} : {me.zoneNames.join(', ')}
              </div>
            ) : null}
            {me?.countryNames && me.countryNames.length > 0 ? (
              <div className="rl" style={{ opacity: 0.7 }}>
                {t('sidebar.countriesLabel')} : {me.countryNames.join(', ')}
              </div>
            ) : null}
            {me?.leaderName ? (
              <div className="rl" style={{ opacity: 0.7 }}>{t('sidebar.leader')} : {me.leaderName}</div>
            ) : null}
            {registeredSince ? (
              <div className="rl" style={{ opacity: 0.7 }}>{t('sidebar.memberSince', { date: registeredSince })}</div>
            ) : null}
          </div>
          <button className="logout" onClick={handleLogout} title={t('sidebar.logout')}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
