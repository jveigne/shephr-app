import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Button, Field, Select, TopBar } from '../components/ui';
import { useToast } from '../components/Toast';
import { downloadDonationsCsv, getByUnit, type ExportParams } from '../services/statsApi';
import { saveBlob } from '../utils/download';
import { startOfMonthISO, startOfYearISO, todayISO, toLocalDate } from '../utils/format';

interface Preset {
  key: string;
  title: string;
  desc: string;
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
    title: 'Ce mois-ci',
    desc: 'Tous les dons déclarés depuis le 1er du mois courant.',
    range: () => ({ from: startOfMonthISO(), to: todayISO() }),
  },
  {
    key: 'lastMonth',
    title: 'Mois dernier',
    desc: 'Le mois civil précédent, du 1er au dernier jour.',
    range: lastMonthRange,
  },
  {
    key: 'ytd',
    title: 'Année en cours',
    desc: 'Cumul depuis le 1er janvier (year-to-date).',
    range: () => ({ from: startOfYearISO(), to: todayISO() }),
  },
  {
    key: 'all',
    title: 'Tout l’historique',
    desc: 'L’intégralité des dons de votre périmètre.',
    range: () => ({}),
  },
];

export function ExportsPage() {
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
      push({ kind: 'ok', title: 'Export téléchargé', msg: `${preset.title} · fichier CSV prêt.` });
    } catch {
      push({ kind: 'error', title: 'Export impossible', msg: 'Réessayez plus tard.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <TopBar title="Exports" crumbs={['shephr', 'Exports']} />

      <div className="content narrow">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <h3 className="ttl">Périmètre de l’export</h3>
              <div className="sub">Filtrez les dons à inclure dans le fichier CSV.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="filters" style={{ marginBottom: 0 }}>
              <Field label="Unité">
                <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <option value="all">Toutes mes unités</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </div>

        <h4 className="section-title">Choisir une période</h4>
        <div className="section-sub">Le fichier est généré au format CSV (UTF-8), prêt pour Excel.</div>

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
                <div className="tt">{p.title}</div>
                <div className="ds">{busy === p.key ? 'Génération en cours…' : p.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="stat-row" style={{ marginTop: 20 }}>
          <div className="icon-wrap">
            <Icon name="info" size={16} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>
            Colonnes : Date, Membre, Unité, Catégorie, Montant, Devise, Note. Les dons sont limités à
            votre périmètre de visibilité.
          </div>
        </div>
      </div>
    </>
  );
}
