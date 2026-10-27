import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { LangSwitch } from './LangSwitch';

/**
 * Gabarit des pages publiques du parcours « Mot de passe oublié » (D-WEB-05, JP 27/10) : même
 * présentation que `/login` (`login-shell`, panneau décoratif, retour, choix de langue), sans
 * dupliquer la page de connexion elle-même.
 */
export function AuthPageLayout({
  backTo,
  backLabel,
  children,
}: {
  backTo: string;
  backLabel: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="login-shell">
      <div className="login-side">
        <div className="deco-1" />
        <div className="deco-2" />
        <button
          type="button"
          className="top"
          onClick={() => navigate('/')}
          title={t('login.backToHome')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div className="brand-mark">S</div>
          <span className="word">shephr</span>
        </button>
        <svg
          viewBox="0 0 360 220"
          width="360"
          height="220"
          style={{ position: 'relative', zIndex: 1, marginTop: 30 }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="pwHill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#C9956B" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#C9956B" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <line x1="0" x2="360" y1="160" y2="160" stroke="rgba(245,236,212,0.18)" strokeWidth="1" />
          <circle cx="270" cy="100" r="38" fill="#C9956B" opacity="0.35" />
          <circle cx="270" cy="100" r="22" fill="#D9AE89" opacity="0.55" />
          <path d="M 0 175 Q 80 145 170 165 T 360 160 L 360 220 L 0 220 Z" fill="url(#pwHill)" />
        </svg>
      </div>

      <div className="login-main" style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => navigate(backTo)}
          style={{
            position: 'absolute', top: 24, left: 24, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-500)',
            fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, padding: 6,
          }}
        >
          <Icon name="chevRight" size={14} style={{ transform: 'rotate(180deg)' }} />
          {backLabel}
        </button>
        <div style={{ position: 'absolute', top: 24, right: 24 }}>
          <LangSwitch />
        </div>
        <div className="login-card">{children}</div>
      </div>
    </div>
  );
}
