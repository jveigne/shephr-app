import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button, Picker, Table, type Column } from './ui';
import { Icon } from './Icon';
import {
  getStudyHierarchyOverview,
  getStudyHierarchyStats,
  type StudyHierarchyModule,
  type StudyHierarchyOverview,
  type StudyHierarchyUnit,
} from '../services/assemblyApi';
import { hierarchyAccessDenied } from '../services/entitlementsApi';
import { isStudyModuleOff } from '../utils/studyAccess';
import { ProgressBar, errMsg } from '../pages/Assembly';

// ---------------------------------------------------------------------------------------------
//  « Le Message de Bertoua » dans la Hiérarchie — suite du lot « pro-plan » (JP 27/10, D-ABO-31 et
//  suivantes). Bloc PAYANT (code personnel `HIERARCHIE_SUIVI`, plan « Suivi de ma hiérarchie ») :
//  statistiques d'étude des assemblées de la CHAÎNE de leadership de l'appelant (supervisor_id
//  récursif) — jamais la géographie (c'est l'axe d'`ETUDE_SUIVI`, offre indépendante).
//  - Vue d'ensemble : assemblées × leçons, chaîne de dirigeants, enseignés / non enseignés, note
//    moyenne (D-ETU-53 / D-ETU-42 / D-ETU-43 — tout calculé par le serveur, rien recalculé ici).
//  - Statistiques sur une période (≤ 731 j) avec évolution mensuelle.
//  - D-ETU-55 : aucun nom de membre, aucune réponse, aucun contenu PERSONNELLE.
//  Un 403 `HIERARCHIE_SUIVI` remonte par `onLocked` (verrou de la page, jamais un toast) ; un 403
//  `STUDY` (interrupteur plateforme coupé) masque le bloc.
//  D-HIE-01 / D-HIE-10 (JP 28/10, lot HIE) : le bloc vit en page 3 « Vie de mon leadership » ; la
//  période des statistiques vient du sélecteur UNIQUE de la page (`from` / `to` en props) — plus de
//  champs de dates propres. Serveur inchangé.
// ---------------------------------------------------------------------------------------------

/** Plage maximale acceptée par `/study/hierarchy/stats` (400 au-delà). */
const MAX_STATS_DAYS = 731;

type View = 'overview' | 'stats';

function locale(lang: string): string {
  return lang.startsWith('en') ? 'en-GB' : 'fr-FR';
}

function fmtNum(n: number | null | undefined, lang: string): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1 }).format(n);
}

function fmtMonth(ym: string, lang: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString(locale(lang), { month: 'short', year: 'numeric' });
}

/** Date « AAAA-MM-JJ » lue en heure LOCALE (jamais minuit UTC) ; un Instant ISO est lu tel quel. */
function fmtDate(iso: string | null, lang: string): string {
  if (!iso) return '—';
  const d =
    iso.length === 10
      ? (() => {
          const [y, m, day] = iso.split('-').map(Number);
          return new Date(y, m - 1, day);
        })()
      : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysBetween(from: string, to: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="kpi" style={{ padding: '12px 14px' }}>
      <div className="lbl" style={{ fontSize: 11 }}>{label}</div>
      <div className="val" style={{ fontSize: 22, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export function StudyHierarchyBlock({ from, to, onLocked }: { from: string; to: string; onLocked: () => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('overview');
  const [off, setOff] = useState(false);
  if (off) return null;

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{t('hierarchy.study.title')}</strong>
        <div role="tablist" style={{ display: 'flex', gap: 4 }}>
          {(['overview', 'stats'] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? 'primary' : 'ghost'} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
              {t(`hierarchy.study.tabs.${v}`)}
            </Button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        {view === 'overview' ? (
          <OverviewView onLocked={onLocked} onOff={() => setOff(true)} />
        ) : (
          <StatsView from={from} to={to} onLocked={onLocked} onOff={() => setOff(true)} />
        )}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-400)' }}>{t('hierarchy.study.hint')}</p>
    </div>
  );
}

/** Erreurs communes : 403 `HIERARCHIE_SUIVI` → verrou de la page ; 403 `STUDY` → bloc masqué. */
function useDeniedEffects(error: unknown, onLocked: () => void, onOff: () => void) {
  const locked = !!hierarchyAccessDenied(error);
  const off = !locked && isStudyModuleOff(error);
  useEffect(() => {
    if (locked) onLocked();
  }, [locked, onLocked]);
  useEffect(() => {
    if (off) onOff();
  }, [off, onOff]);
  return locked || off;
}

function OverviewView({ onLocked, onOff }: { onLocked: () => void; onOff: () => void }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['assembly', 'study', 'hierarchy', 'overview'],
    queryFn: () => getStudyHierarchyOverview(),
    retry: false,
  });
  const [moduleId, setModuleId] = useState('');
  const modules = q.data?.modules ?? [];
  const currentId = (modules.find((m) => m.id === moduleId) ?? modules[0])?.id;
  // D-ABO-36 (JP 27/10, revue avenant 04) : enseignés / non enseignés / moyenne sont calculés par le
  // serveur sur les modules renvoyés — on relit donc la vue AVEC moduleId pour le module affiché,
  // comme le mobile (sinon les chiffres porteraient sur tous les modules).
  const perModule = useQuery({
    queryKey: ['assembly', 'study', 'hierarchy', 'overview', currentId],
    queryFn: () => getStudyHierarchyOverview(currentId),
    enabled: !!currentId && modules.length > 1,
    retry: false,
  });
  const handled = useDeniedEffects(q.error ?? perModule.error, onLocked, onOff);

  if (q.isLoading) return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</p>;
  if (handled) return null;
  if (q.isError || !q.data) {
    return <p role="alert" style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{errMsg(q.error, t('hierarchy.study.loadError'))}</p>;
  }
  const o: StudyHierarchyOverview = modules.length > 1 ? (perModule.data ?? q.data) : q.data;
  if (o.units.length === 0 || modules.length === 0) {
    return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('hierarchy.study.empty')}</p>;
  }
  const current = modules.find((m) => m.id === currentId) ?? modules[0];
  if (modules.length > 1 && perModule.isLoading) {
    return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</p>;
  }
  return (
    <>
      {o.modules.length > 1 && (
        <div style={{ maxWidth: 360, marginBottom: 12 }}>
          <Picker
            value={current.id}
            onChange={setModuleId}
            placeholder={t('hierarchy.study.module')}
            options={o.modules.map((m) => ({ id: m.id, label: [m.code, m.name].filter(Boolean).join(' · ') }))}
          />
        </div>
      )}
      <ModuleTable module={current} units={o.units} />
    </>
  );
}

function ModuleTable({ module: m, units }: { module: StudyHierarchyModule; units: StudyHierarchyUnit[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const total = m.lessons.length;
  type Row = StudyHierarchyUnit & { id: string; done: Set<string>; doneHere: number };
  const rows: Row[] = useMemo(
    () =>
      units.map((u) => {
        const done = new Set(u.doneLessonIds);
        return { ...u, id: u.unitId, done, doneHere: m.lessons.filter((l) => done.has(l.id)).length };
      }),
    [units, m.lessons],
  );

  const cols: Column<Row>[] = [
    {
      label: t('hierarchy.study.assembly'),
      style: { minWidth: 200 },
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {r.unitName}
            {r.cityName && <span style={{ color: 'var(--ink-500)', fontSize: 12, fontWeight: 400 }}> · {r.cityName}</span>}
          </div>
          {/* Chaîne de dirigeants entre l'appelant et l'assemblée (du plus haut au plus bas), puis
              son dirigeant — noms de DIRIGEANTS seulement, jamais de membre (D-ETU-55). */}
          {(r.supervisorChain.length > 0 || r.leaderName) && (
            <div style={{ color: 'var(--ink-500)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <Icon name="hierarchy" size={11} />
              <span>
                {[...r.supervisorChain, ...(r.leaderName && r.supervisorChain[r.supervisorChain.length - 1] !== r.leaderName ? [r.leaderName] : [])].join(' › ')}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      label: t('hierarchy.study.taught'),
      render: (r) => (
        <div style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
          <strong>{r.taughtCount}</strong>/{r.memberCount}
          {r.notTaughtCount > 0 && (
            <div style={{ color: 'var(--earth-700)', fontSize: 12 }}>{t('hierarchy.study.notTaught', { count: r.notTaughtCount })}</div>
          )}
        </div>
      ),
    },
    {
      label: t('hierarchy.study.progress'),
      style: { minWidth: 140 },
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <ProgressBar percent={total > 0 ? (100 * r.doneHere) / total : 0} height={6} />
          </div>
          <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.doneHere}/{total}</span>
        </div>
      ),
    },
    ...m.lessons.map(
      (l, i): Column<Row> => ({
        label: <span title={l.title}>{l.number ?? i + 1}</span>,
        style: { textAlign: 'center', width: 32 },
        cellStyle: { textAlign: 'center' },
        render: (r) =>
          r.done.has(l.id) ? (
            <span style={{ color: 'var(--ok)', fontWeight: 700 }} aria-label={t('hierarchy.study.done')}>✓</span>
          ) : (
            <span style={{ color: 'var(--ink-300, var(--ink-400))' }} aria-label={t('hierarchy.study.notDone')}>–</span>
          ),
      }),
    ),
    {
      label: t('hierarchy.study.average'),
      render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.averageScorePercent == null ? '—' : `${fmtNum(r.averageScorePercent, lang)} %`}</span>,
    },
    {
      label: t('hierarchy.study.lastSession'),
      render: (r) => <span style={{ color: 'var(--ink-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(r.lastSessionDate, lang)}</span>,
    },
  ];

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--ink-600)', marginBottom: 8 }}>
        {[m.code, m.name].filter(Boolean).join(' · ')} · {t('hierarchy.study.lessons', { count: total })}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <Table columns={cols} rows={rows} zebra />
      </div>
    </>
  );
}

function StatsView({ from, to, onLocked, onOff }: { from: string; to: string; onLocked: () => void; onOff: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const ordered = !!from && !!to && from <= to;
  const tooLong = ordered && daysBetween(from, to) > MAX_STATS_DAYS;
  const valid = ordered && !tooLong;
  const q = useQuery({
    queryKey: ['assembly', 'study', 'hierarchy', 'stats', from, to],
    queryFn: () => getStudyHierarchyStats(from, to),
    enabled: valid,
    retry: false,
  });
  const handled = useDeniedEffects(q.error, onLocked, onOff);

  let body: ReactNode;
  if (!valid) {
    body = (
      <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>
        {tooLong ? t('hierarchy.study.periodTooLong', { days: MAX_STATS_DAYS }) : t('hierarchy.study.invalidPeriod')}
      </p>
    );
  } else if (q.isLoading) {
    body = <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</p>;
  } else if (handled) {
    body = null;
  } else if (q.isError || !q.data) {
    body = <p role="alert" style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{errMsg(q.error, t('hierarchy.study.loadError'))}</p>;
  } else {
    const s = q.data;
    const maxSessions = Math.max(1, ...s.monthly.map((m) => m.sessionsFinished));
    body = (
      <>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 14 }}>
          <Kpi label={t('hierarchy.study.sessionsFinished')} value={s.sessionsFinished} />
          <Kpi label={t('hierarchy.study.lessonsDone')} value={s.lessonsDone} />
          <Kpi label={t('hierarchy.study.membersTaught')} value={s.membersTaught} />
          <Kpi label={t('hierarchy.study.average')} value={s.averageScorePercent == null ? '—' : `${fmtNum(s.averageScorePercent, lang)} %`} />
        </div>
        {s.monthly.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13 }}>{t('hierarchy.study.noSessions')}</p>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('hierarchy.study.monthly')}</div>
            <div style={{ overflowX: 'auto' }}>
              <Table
                columns={[
                  { label: t('hierarchy.study.month'), render: (m) => <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{fmtMonth(m.month, lang)}</span> },
                  {
                    label: t('hierarchy.study.sessionsFinished'),
                    style: { minWidth: 160 },
                    render: (m) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}><ProgressBar percent={(100 * m.sessionsFinished) / maxSessions} height={6} /></div>
                        <span style={{ fontSize: 12.5 }}>{m.sessionsFinished}</span>
                      </div>
                    ),
                  },
                  { label: t('hierarchy.study.membersTaught'), render: (m) => <span>{m.membersTaught}</span> },
                ]}
                rows={s.monthly.map((m) => ({ ...m, id: m.month }))}
                zebra
              />
            </div>
          </>
        )}
      </>
    );
  }

  return <>{body}</>;
}
