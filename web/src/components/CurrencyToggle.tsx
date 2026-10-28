import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingCurrency } from '../services/billingApi';
import { useCurrencyChoice } from '../utils/currency';

// ---------------------------------------------------------------------------------------------
//  Sélecteur € / $ — D-CUR-03, JP 28/10 (RG-CUR-18 / 19). Deux boutons à `aria-pressed`, partagés par
//  `/offres` (une fois, en tête de la section prix), `LockedFeature` (Néhémie) et `HierarchyLockedFeature`
//  (Caleb) : même choix gardé (`utils/currency`). Masqué quand les offres affichées n'ont qu'une devise.
//  Il ne fait que choisir la ligne `PlanPrice` du serveur : aucune conversion (RG-CUR-04).
// ---------------------------------------------------------------------------------------------

export function CurrencyToggle({
  available,
  align = 'start',
  style,
}: {
  /** Devises proposées par les offres affichées (`utils/currency.currenciesOf`). */
  available: BillingCurrency[];
  align?: 'start' | 'center';
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const [currency, setCurrency] = useCurrencyChoice();
  if (available.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={t('offers.currency.label')}
      style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: align === 'center' ? 'center' : 'flex-start', ...style }}
    >
      <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>{t('offers.currency.label')}</span>
      <div style={{ display: 'inline-flex', gap: 4 }}>
        {available.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={currency === c}
            onClick={() => setCurrency(c)}
            className={`btn sm ${currency === c ? 'primary' : 'secondary'}`}
            style={{ minWidth: 44, justifyContent: 'center' }}
          >
            {t(c === 'USD' ? 'offers.currency.usd' : 'offers.currency.eur')}
          </button>
        ))}
      </div>
    </div>
  );
}

/** RG-CUR-20 — mention « Prix en euros uniquement » quand la devise choisie n'est pas proposée. */
export function EurOnlyNote({ show, color, style }: { show: boolean; color?: string; style?: CSSProperties }) {
  const { t } = useTranslation();
  if (!show) return null;
  return <p style={{ margin: '4px 0 0', fontSize: 12.5, color: color ?? 'var(--ink-500)', ...style }}>{t('offers.currency.eurOnly')}</p>;
}
