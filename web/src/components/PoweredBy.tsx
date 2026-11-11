import { useTranslation } from 'react-i18next';
import { useBranding } from '../theme/BrandingProvider';

/**
 * Spec §4.5 (JP 11/11) — mention FIXE « propulsé par Shephr » (`branding.poweredBy`, non configurable), en bas de
 * l'accueil et des réglages, seulement quand un pays est actif.
 */
export function PoweredBy() {
  const { t } = useTranslation();
  const b = useBranding();
  if (!b.countryIso) return null;
  return (
    <p style={{ margin: '28px 0 8px', textAlign: 'center', fontSize: 12, color: 'var(--ink-400)', letterSpacing: '.02em' }}>
      {t('branding.poweredBy')}
    </p>
  );
}

/**
 * §5.5 — texte d'accueil du pays (`welcome`) en tête de l'accueil, avec le lien du site s'il existe. Rien en Shephr
 * standard.
 */
export function BrandingWelcomeCard() {
  const { t } = useTranslation();
  const b = useBranding();
  if (!b.countryIso || !b.welcome) return null;
  return (
    <div
      style={{
        background: 'var(--ivory-card)', border: '1px solid var(--line-soft)', borderLeft: '4px solid var(--green-800)',
        borderRadius: 'var(--radius-lg)', padding: '16px 18px', margin: '0 0 20px', boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 500, color: 'var(--green-800)', marginBottom: 6 }}>
        {b.welcome.title}
      </div>
      {b.welcome.text && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-700)' }}>{b.welcome.text}</p>
      )}
      {b.websiteUrl && (
        <a
          href={b.websiteUrl}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', marginTop: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--green-700)' }}
        >
          {t('branding.website')}
        </a>
      )}
    </div>
  );
}
