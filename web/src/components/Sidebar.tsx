import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { useAuth } from '../hooks/useAuth';

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

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Pilotage',
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard', to: '/dashboard' },
      { id: 'donations', label: 'Dons', icon: 'donation', to: '/donations' },
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
          { id: 'ministeres', label: 'Ministères', to: '/structure/ministeres' },
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
      { id: 'exports', label: 'Exports', icon: 'export', to: '/exports' },
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

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar">
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
            <div className="nm">{me?.fullName ?? '—'}</div>
            <div className="rl">{me?.role === 'ADMIN' ? 'Administrateur' : me?.role ?? ''}</div>
          </div>
          <button className="logout" onClick={handleLogout} title="Déconnexion">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
