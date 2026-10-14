import { useTranslation } from 'react-i18next';
import { Field, Input, Picker } from './ui';
import { fmtMonth, periodRangeError, recentMonths, recentYears, type Period, type PeriodMode } from '../utils/events';

// ---------------------------------------------------------------------------------------------
//  Filtre de période des Évènements — D-EVT-06 (JP 14/10) : mois / année / plage libre (la plage
//  couvre le « quinquennat » de la spec §6.2 : 5 ans au plus, comme le serveur).
// ---------------------------------------------------------------------------------------------

const MODES: PeriodMode[] = ['month', 'year', 'range'];

export function EventPeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const rangeError = periodRangeError(value);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <Field label={t('events.period.label')}>
        <div role="tablist" style={{ display: 'flex', gap: 4, minHeight: 38, alignItems: 'center' }}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={value.mode === m}
              className={`btn sm ${value.mode === m ? 'primary' : 'ghost'}`}
              onClick={() => onChange({ ...value, mode: m })}
            >
              {t(`events.period.${m}`)}
            </button>
          ))}
        </div>
      </Field>
      {value.mode === 'month' && (
        <Field label={t('events.period.month')}>
          <Picker
            value={value.month}
            onChange={(month) => onChange({ ...value, month })}
            options={recentMonths().map((m) => ({ id: m, label: fmtMonth(m, lang) }))}
            placeholder={t('events.period.month')}
            searchFrom={99}
            style={{ minWidth: 180 }}
          />
        </Field>
      )}
      {value.mode === 'year' && (
        <Field label={t('events.period.year')}>
          <Picker
            value={String(value.year)}
            onChange={(y) => onChange({ ...value, year: Number(y) })}
            options={recentYears().map((y) => ({ id: String(y), label: String(y) }))}
            placeholder={t('events.period.year')}
            searchFrom={99}
            style={{ width: 120 }}
          />
        </Field>
      )}
      {value.mode === 'range' && (
        <>
          <Field label={t('events.period.from')}>
            <Input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </Field>
          <Field label={t('events.period.to')}>
            <Input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </Field>
          {rangeError && (
            <span role="alert" style={{ color: 'var(--err)', fontSize: 12.5, paddingBottom: 10 }}>
              {t(rangeError)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
