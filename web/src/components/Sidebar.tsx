import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { useAuth } from '../hooks/useAuth';
import { primaryRoleLabel } from '../services/authApi';
import { FEATURES } from '../config/features';

interface NavChild {
  id: string;
  label: string;
  to: string;
}

interface NavItem {
  id: string;
  label: string;
  to?: string;
  icon: string;
  children?: NavChild[];
}

// Livraison « Goals only » (décision JP 2026-06-10) : les entrées Dons
// (Tableau de bord, Dons, Exports) sont masquées tant que FEATURES.donations=false.
const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Pilotage',
    items: [
      ...(FEATURES.donations
        ? [
            { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard', to: '/dashboard' },
            { id: 'donations', label: 'Dons', icon: 'donation', to: '/donations' },
          ]
        : []),
      { id: 'goals', label: 'Objectifs', icon: 'sparkle', to: '/goals' },
    ],
  },
  {
    section: 'Organisation',
    items: [
      {
        id: 'structure',
        label: 'Structure',
        icon: 'building',
        children: [
          { id: 'ministeres', label: 'Mon ministère', to: '/structure/ministeres' },
          { id: 'zones', label: 'Zones', to: '/structure/zones' },
          { id: 'localites', label: 'Localités', to: '/structure/localites' },
          { id: 'unites', label: 'Unités', to: '/structure/unites' },
        ],
      },
      { id: 'users', label: 'Utilisateurs', icon: 'users', to: '/users' },
      { id: 'hierarchy', label: 'Hiérarchie des dirigeants', icon: 'hierarchy', to: '/hierarchy' },
    ],
  },
  {
    section: 'Système',
    items: [
      ...(FEATURES.donations
        ? [{ id: 'exports', label: 'Exports', icon: 'export', to: '/exports' }]
        : []),
      { id: 'settings', label: 'Paramètres', icon: 'settings', to: '/settings' },
    ],
  },
];

export function Sidebar() {
  const { me, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [structureOpen, setStructureOpen] = useState(
    location.pathname.startsWith('/structure'),
  );

  useEffect(() => {
    if (location.pathname.startsWith('/structure')) setStructureOpen(true);
  }, [location.pathname]);

  const initials = (me?.fullName ?? 'A·')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  // Lot 2.1 — consommation des champs enrichis du /me (langue, dirigeant, date d'inscription).
  const registered = me?.registeredAt ? new Date(me.registeredAt) : null;
  const registeredValid = registered != null && !Number.isNaN(registered.getTime());
  const registeredSince = registeredValid
    ? registered!.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : null;
  const registeredTitle = registeredValid
    ? `Inscrit le ${registered!.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
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
            <span className="sub">Administration</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <div className="nav-section-label">{section}</div>
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
                        <span>{item.label}</span>
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
                              <span>{c.label}</span>
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
                    <span>{item.label}</span>
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
              {primaryRoleLabel(me)}
              {me?.language ? (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '0 5px',
                    borderRadius: 6,
                    border: '1px solid currentColor',
                    opacity: 0.75,
                  }}
                >
                  {me.language}
                </span>
              ) : null}
            </div>
            {me?.unitNames && me.unitNames.length > 0 ? (
              <div className="rl" style={{ opacity: 0.7 }}>
                {me.unitNames.length > 1 ? 'Unités' : 'Unité'} : {me.unitNames.join(', ')}
              </div>
            ) : null}
            {me?.zoneNames && me.zoneNames.length > 0 ? (
              <div className="rl" style={{ opacity: 0.7 }}>
                {me.zoneNames.length > 1 ? 'Zones' : 'Zone'} : {me.zoneNames.join(', ')}
              </div>
            ) : null}
            {me?.countryNames && me.countryNames.length > 0 ? (
              <div className="rl" style={{ opacity: 0.7 }}>
                {me.countryNames.length > 1 ? 'Pays' : 'Pays'} : {me.countryNames.join(', ')}
              </div>
            ) : null}
            {me?.leaderName ? (
              <div className="rl" style={{ opacity: 0.7 }}>Dirigeant : {me.leaderName}</div>
            ) : null}
            {registeredSince ? (
              <div className="rl" style={{ opacity: 0.7 }}>Membre depuis {registeredSince}</div>
            ) : null}
          </div>
          <button className="logout" onClick={handleLogout} title="Déconnexion">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
