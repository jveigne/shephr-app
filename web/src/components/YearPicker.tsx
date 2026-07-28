import { useTranslation } from 'react-i18next';
import { Picker } from './ui';

/**
 * Sélecteur d'ANNÉE des Objectifs (barre du haut) — même rendu partout : la liste native
 * s'affichait mal, on réutilise le Picker de la page. La liste passée est celle des années
 * VISIBLES du Goal (les jalons), pas les années ouvertes en écriture.
 */
export function YearPicker({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number;
  onChange: (year: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--ink-400)',
        whiteSpace: 'nowrap',
      }}
    >
      {t('goals.year')}
      <Picker
        value={String(value)}
        onChange={(y) => onChange(Number(y))}
        options={years.map((y) => ({ id: String(y), label: String(y) }))}
        placeholder={t('goals.year')}
        // Une poignée de jalons : pas de champ de recherche.
        searchFrom={99}
        style={{ width: 108 }}
      />
    </label>
  );
}
