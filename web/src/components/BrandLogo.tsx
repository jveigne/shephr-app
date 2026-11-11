import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useBranding } from '../theme/BrandingProvider';

/**
 * D-PAYS-03 (JP 11/11) — marque de l'en-tête : logo INTÉGRÉ du pays actif, posé dans une PASTILLE BLANCHE RONDE (le
 * logo CMCI provisoire est un JPEG à fond blanc : tel quel il ferait un carré blanc sur la principale, spec §4.6) ;
 * sans pays actif ou sans logo intégré : la marque Shephr (`.brand-mark` « S »), aux couleurs du pays le cas échéant.
 */
export function BrandLogo({ size = 32, style }: { size?: number; style?: CSSProperties }) {
  const { t } = useTranslation();
  const b = useBranding();
  if (b.logo) {
    return (
      <span
        style={{
          width: size, height: size, borderRadius: '50%', background: '#FFFFFF', // pastille blanche : fond du logo fourni
          display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.06)', ...style,
        }}
      >
        <img src={b.logo} alt={b.displayName} width={size} height={size} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </span>
    );
  }
  return (
    <div className="brand-mark" aria-label={b.displayName} style={size !== 32 ? { width: size, height: size, ...style } : style}>
      {t('branding.markLetter')}
    </div>
  );
}

/**
 * Nom de l'en-tête (recette 13) : `displayName` d'un pays actif (`short` → `shortName`, barres étroites), sinon le mot
 * Shephr de l'i18n (`branding.wordmark`, rendu historique en minuscules). Jamais « Shephr » / « CMCI » en dur.
 */
export function BrandName({ short = false }: { short?: boolean }) {
  const { t } = useTranslation();
  const b = useBranding();
  if (!b.countryIso) return <>{t('branding.wordmark')}</>;
  return <>{short ? b.shortName : b.displayName}</>;
}
