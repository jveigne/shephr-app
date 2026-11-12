import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from './ui';
import { Icon } from './Icon';
import { useTheme } from '../hooks/useTheme';
import { estHexValide, normaliserHex } from '../theme/couleurs';
import { ACCENTS_PREDEFINIS, MODES, type ModeTheme } from '../theme/palettes';

/**
 * Section « Apparence » de la page Paramètres (`docs/theme-plan.md` §4.3, étape W2) : mode et
 * couleur d'accent, avec un aperçu. Même contenu que l'écran Apparence du mobile
 * (`mobile/app/appearance.tsx`), mêmes pastilles (D2).
 *
 * <p>Montée dans `pages/Settings.tsx`, donc seulement pour un compte connecté : aucun sélecteur de
 * thème sur une page publique (D4). Seule une action ICI enverra le choix au compte (W4).
 * Tout est coloré par les variables de rôle : la carte change de thème en même temps que la page.
 */
export function AppearanceCard() {
  const { t } = useTranslation();
  const { mode, modeResolu, accent, setMode, setAccent } = useTheme();
  const [saisie, setSaisie] = useState(accent);
  const [erreur, setErreur] = useState(false);
  const noirEtBlanc = modeResolu === 'noirEtBlanc';

  const appliquerSaisie = () => {
    const v = saisie.trim().startsWith('#') ? saisie.trim() : `#${saisie.trim()}`;
    if (!estHexValide(v)) {
      setErreur(true);
      return;
    }
    setErreur(false);
    setSaisie(normaliserHex(v));
    setAccent(v);
  };

  return (
    <>
      <h3 style={{ margin: '0 0 10px', color: 'var(--texte)' }}>{t('settings.appearance.title')}</h3>
      {/* Couleurs de rôle en propre : la classe `.card` n'est migrée qu'à l'étape W3a. */}
      <div
        className="card"
        style={{
          padding: '18px 20px',
          marginBottom: 28,
          maxWidth: 560,
          background: 'var(--surface)',
          border: '1px solid var(--filet-doux)',
          color: 'var(--texte-corps)',
        }}
      >
        <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.55, color: 'var(--texte-3)' }}>
          {t('settings.appearance.intro')}
        </p>

        {/* Mode */}
        <div style={titreSection}>{t('settings.appearance.modeSection')}</div>
        <div role="radiogroup" aria-label={t('settings.appearance.modeSection')} style={{ display: 'grid', gap: 8 }}>
          {MODES.map((m: ModeTheme) => {
            const actif = m === mode;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={actif}
                onClick={() => setMode(m)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${actif ? 'var(--accent)' : 'var(--filet)'}`,
                  background: actif ? 'var(--accent-teinte-douce)' : 'var(--surface-haute)',
                  color: 'var(--texte-corps)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    flexShrink: 0,
                    border: `2px solid ${actif ? 'var(--accent)' : 'var(--filet-fort)'}`,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {actif && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>
                    {t(`settings.appearance.modes.${m}`)}
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--texte-3)', marginTop: 2 }}>
                    {t(`settings.appearance.modes.${m}Help`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Accent */}
        <div style={{ ...titreSection, marginTop: 20 }}>{t('settings.appearance.accentSection')}</div>
        {noirEtBlanc && (
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--texte-3)' }}>
            {t('settings.appearance.accentIgnored')}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, opacity: noirEtBlanc ? 0.5 : 1 }}>
          {ACCENTS_PREDEFINIS.map((a) => {
            const actif = normaliserHex(accent) === a.valeur;
            return (
              <button
                key={a.id}
                type="button"
                title={t(`settings.appearance.accents.${a.id}`)}
                aria-label={t(`settings.appearance.accents.${a.id}`)}
                aria-pressed={actif}
                onClick={() => {
                  setSaisie(a.valeur);
                  setErreur(false);
                  setAccent(a.valeur);
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  // Pastille = la couleur elle-même, jamais un rôle : c'est ce qu'on choisit.
                  background: a.valeur,
                  border: actif ? '3px solid var(--texte)' : '3px solid transparent',
                  outline: '1px solid var(--filet)',
                  outlineOffset: 1,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#FFFFFF',
                }}
              >
                {actif && <Icon name="check" size={16} />}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 14 }}>
          <label htmlFor="accent-libre" style={{ fontSize: 12, fontWeight: 500, color: 'var(--texte-2)' }}>
            {t('settings.appearance.customAccent')}
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                flexShrink: 0,
                background: estHexValide(saisie) ? normaliserHex(saisie) : 'transparent',
                border: '1px solid var(--filet)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input
                id="accent-libre"
                value={saisie}
                maxLength={7}
                placeholder="#1E3A2F"
                aria-invalid={erreur}
                onChange={(e) => {
                  setSaisie(e.target.value);
                  setErreur(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') appliquerSaisie();
                }}
              />
            </div>
            <Button onClick={appliquerSaisie}>{t('settings.appearance.apply')}</Button>
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 12,
              color: erreur ? 'var(--alerte)' : 'var(--texte-4)',
            }}
          >
            {erreur ? t('settings.appearance.invalidHex') : t('settings.appearance.contrastNote')}
          </p>
        </div>

        {/* Aperçu : couleurs du thème courant, donc l'accent déjà ajusté. */}
        <div style={{ ...titreSection, marginTop: 20 }}>{t('settings.appearance.previewSection')}</div>
        <div
          style={{
            background: 'var(--page)',
            border: '1px solid var(--filet)',
            borderRadius: 'var(--radius)',
            padding: 14,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--filet-doux)',
              borderRadius: 'var(--radius)',
              padding: '12px 14px',
            }}
          >
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--accent)' }}>
              {t('settings.appearance.previewTitle')}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--texte-3)', marginTop: 2 }}>
              {t('settings.appearance.previewMeta')}
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 99,
                background: 'var(--accent-teinte)',
                marginTop: 10,
                overflow: 'hidden',
              }}
            >
              <div style={{ width: '62%', height: '100%', background: 'var(--accent)' }} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" size="sm" tabIndex={-1}>
                {t('settings.appearance.previewButton')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const titreSection = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--texte-3)',
  marginBottom: 8,
};
