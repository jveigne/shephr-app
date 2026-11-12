import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';

/** Sélecteur FR/EN des pages publiques (accessible sans connexion). */
export function LangSwitch() {
  const { i18n, t } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';
  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      style={{ display: 'inline-flex', border: '1px solid var(--filet)', borderRadius: 999, overflow: 'hidden' }}
    >
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLanguage(l)}
          aria-pressed={lang === l}
          style={{
            padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: lang === l ? 'var(--accent-doux)' : 'transparent',
            color: lang === l ? 'var(--sur-accent)' : 'var(--texte-3)',
          }}
        >{l.toUpperCase()}</button>
      ))}
    </div>
  );
}