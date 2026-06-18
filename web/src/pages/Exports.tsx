import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { Button, Field, Select, TopBar } from '../components/ui';
import { useToast } from '../components/Toast';
import { downloadDonationsCsv, getByUnit, type ExportParams } from '../services/statsApi';
import { saveBlob } from '../utils/download';
import { startOfMonthISO, startOfYearISO, todayISO, toLocalDate } from '../utils/format';

interface Preset {
  key: string;
  titleKey: string;
  descKey: string;
  range: () => { from?: string; to?: string };
}

const lastMonthRange = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: toLocalDate(first), to: toLocalDate(last) };
};

const PRESETS: Preset[] = [
  {
    key: 'month',
    titleKey: 'presetMonthTitle',
    descKey: 'presetMonthDesc',
    range: () => ({ from: startOfMonthISO(), to: todayISO() }),
  },
  {
    key: 'lastMonth',
    titleKey: 'presetLastMonthTitle',
    descKey: 'presetLastMonthDesc',
    range: lastMonthRange,
  },
  {
    key: 'ytd',
    titleKey: 'presetYtdTitle',
    descKey: 'presetYtdDesc',
    range: () => ({ from: startOfYearISO(), to: todayISO() }),
  },
  {
    key: 'all',
    titleKey: 'presetAllTitle',
    descKey: 'presetAllDesc',
    range: () => ({}),
  },
];

export function ExportsPage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const [unitId, setUnitId] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const unitsStatsQ = useQuery({ queryKey: ['stats', 'by-unit'], queryFn: () => getByUnit() });
  const units = useMemo(() => {
    const map = new Map<string, string>();
    (unitsStatsQ.data ?? []).forEach((s) => map.set(s.unitId, s.unitName));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [unitsStatsQ.data]);

  const runExport = async (preset: Preset) => {
    setBusy(preset.key);
    try {
      const params: ExportParams = {
        ...preset.range(),
        unitId: unitId === 'all' ? undefined : unitId,
      };
      const blob = await downloadDonationsCsv(params);
      saveBlob(blob, `dons-${preset.key}-${todayISO()}.csv`);
      push({
        kind: 'ok',
        title: t('exports.exportDownloaded'),
        msg: t('exports.presetReady', { title: t(`exports.${preset.titleKey}`) }),
      });
    } catch {
      push({ kind: 'error', title: t('exports.exportFailed'), msg: t('common.retryLater') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <TopBar title={t('exports.title')} crumbs={[t('common.brand'), t('exports.title')]} />

      <div className="content narrow">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <h3 className="ttl">{t('exports.scope')}</h3>
              <div className="sub">{t('exports.scopeSub')}</div>
            </div>
          </div>
          <div className="card-body">
            <div className="filters" style={{ marginBottom: 0 }}>
              <Field label={t('donations.unit')}>
                <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <option value="all">{t('exports.allMyUnits')}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </div>

        <h4 className="section-title">{t('exports.choosePeriod')}</h4>
        <div className="section-sub">{t('exports.chooseSub')}</div>

        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className="preset"
              disabled={busy !== null}
              onClick={() => runExport(p)}
              style={{ textAlign: 'left' }}
            >
              <div className="icon-wrap">
                <Icon name={busy === p.key ? 'download' : 'export'} size={20} />
              </div>
              <div>
                <div className="tt">{t(`exports.${p.titleKey}`)}</div>
                <div className="ds">{busy === p.key ? t('exports.generating') : t(`exports.${p.descKey}`)}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="stat-row" style={{ marginTop: 20 }}>
          <div className="icon-wrap">
            <Icon name="info" size={16} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>
            {t('exports.columnsInfo')}
          </div>
        </div>
      </div>
    </>
  );
}
