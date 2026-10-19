import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from './ui';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { useAuth } from '../hooks/useAuth';
import { FEATURES } from '../config/features';
import { getAccessibleModules, hasMinistryAccess } from '../services/authApi';
import { getAssemblyStats, listMeetingsInRange, type UnitMeetingStats } from '../services/assemblyApi';
import type { LeaderHierarchyNode } from '../services/leadersApi';
import {
  ALERT_DAYS,
  aggregate,
  averageAttendance,
  chunk,
  daysBetween,
  isAlert,
  subtreeUnitIds,
  todayIso,
  treeUnitIds,
  type HierarchyAggregate,
} from '../utils/assemblyHierarchyStats';
import {
  PERIODICITIES,
  buildConsolidatedJournalHtml,
  currentPeriod,
  isFuturePeriod,
  periodLabel,
  periodRange,
  shiftPeriod,
  type Period,
} from '../utils/assemblyJournal';
import { printHtml } from '../utils/printHtml';
import type { Translate } from '../utils/meetingReport';

// ---------------------------------------------------------------------------------------------
//  Vie d'assemblée dans la Hiérarchie — D-ASM-18 (JP 08/10).
//
//  - Statistiques des comptes rendus des assemblées portées par l'arbre affiché (règle J-4),
//    agrégées par dirigeant (lui + descendants), sur une période choisie ;
//  - alerte « sans CR depuis 3 semaines » : AFFICHAGE SEUL, aucune relance (D-ASM-09 gelé) ;
//  - AUCUN NOM de personne : que des nombres et des noms d'assemblée (stats ET journal) ;
//  - journal PDF consolidé (tout le périmètre, ou le sous-arbre d'un dirigeant).
//  Droits : ceux de RG-ASM-05, appliqués par le serveur — aucune nouvelle règle d'accès.
//  Visible seulement avec l'abonnement ASSEMBLY (RG-06) et pour un non-MEMBRE.
// ---------------------------------------------------------------------------------------------

interface StatsContextValue {
  period: Period;
  setPeriod: (p: Period) => void;
  today: string;
  statsById: Map<string, UnitMeetingStats>;
  /** Agrégat de toute la hiérarchie affichée. */
  all: HierarchyAggregate;
  busy: boolean;
  /** Journal consolidé d'un sous-arbre (`node`) ou de toute la hiérarchie (`null`). */
  printJournal: (node: LeaderHierarchyNode | null) => void;
}

const StatsContext = createContext<StatsContextValue | null>(null);

/** Hors périmètre (pas d'abonnement, membre, chargement) : null → aucun rendu dans l'arbre. */
const useStats = () => useContext(StatsContext);

export function AssemblyStatsProvider({
  roots,
  isChain,
  children,
}: {
  roots: LeaderHierarchyNode[];
  /** Mode CHAIN = vue d'un membre (sa chaîne de rattachement) : pas de statistiques. */
  isChain: boolean;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const { push } = useToast();

  // RG-06 : même gating que Sidebar.tsx (abonnement ASSEMBLY + flag de livraison).
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const hasAssembly = FEATURES.assembly && (modulesQ.data ?? []).includes('ASSEMBLY');
  const enabled = hasAssembly && hasMinistryAccess(me) && !isChain && roots.length > 0;

  const [period, setPeriod] = useState<Period>(() => currentPeriod('month'));
  const { from, to } = periodRange(period);
  const today = todayIso();

  const statsQ = useQuery({
    queryKey: ['assembly', 'stats', from, to],
    queryFn: () => getAssemblyStats(from, to),
    enabled,
  });

  const statsById = useMemo(
    () => new Map((statsQ.data ?? []).map((r) => [r.unitId, r] as const)),
    [statsQ.data],
  );
  const all = useMemo(() => aggregate(treeUnitIds(roots), statsById, today), [roots, statsById, today]);

  const [busy, setBusy] = useState(false);
  const printJournal = useCallback(
    (node: LeaderHierarchyNode | null) => {
      const agg = node ? aggregate(subtreeUnitIds(node), statsById, today) : all;
      // N'appeler /meetings que pour les assemblées ayant des CR sur la période, par paquets de 100.
      const ids = agg.rows.filter((r) => r.meetingCount > 0).map((r) => r.unitId);
      if (ids.length === 0) return;
      setBusy(true);
      Promise.all(chunk(ids, 100).map((part) => listMeetingsInRange(part, from, to)))
        .then((parts) =>
          printHtml(
            buildConsolidatedJournalHtml(
              {
                // D-ASM-18 (JP 08/10) : aucun nom de personne dans le journal consolidé, pas même
                // celui du dirigeant — libellé générique (aligné sur le mobile).
                scopeLabel: node
                  ? t('assembly.journal.scopeLeader', { count: agg.total })
                  : t('assembly.journal.scopeAll'),
                period,
                aggregate: agg,
                meetings: parts.flat(),
                today,
                locale: i18n.language,
              },
              t as unknown as Translate,
            ),
          ),
        )
        .catch(() => push({ kind: 'error', title: t('assembly.journal.failed') }))
        .finally(() => setBusy(false));
    },
    [all, statsById, today, from, to, period, t, i18n.language, push],
  );

  const value = useMemo<StatsContextValue | null>(
    () => (enabled && statsQ.data ? { period, setPeriod, today, statsById, all, busy, printJournal } : null),
    [enabled, statsQ.data, period, today, statsById, all, busy, printJournal],
  );

  return (
    <StatsContext.Provider value={value}>
      {enabled && <StatsBlock loading={statsQ.isLoading} error={statsQ.isError} period={period} setPeriod={setPeriod} />}
      {children}
    </StatsContext.Provider>
  );
}

/** Sélecteur de période : identique au journal mobile (Mois / Trimestre / Semestre / Année + ‹ ›). */
function PeriodPicker({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  const { t } = useTranslation();
  const next = shiftPeriod(period, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PERIODICITIES.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={period.kind === kind ? 'primary' : 'ghost'}
            onClick={() => period.kind !== kind && setPeriod(currentPeriod(kind))}
          >
            {t(`assembly.journal.kind.${kind}`)}
          </Button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconButton
          icon={<Icon name="chevLeft" size={14} />}
          aria-label={t('hierarchy.stats.previous')}
          onClick={() => setPeriod(shiftPeriod(period, -1))}
        />
        <strong style={{ minWidth: 140, textAlign: 'center', fontSize: 13.5 }}>
          {periodLabel(period, t as unknown as Translate)}
        </strong>
        <IconButton
          icon={<Icon name="chevRight" size={14} />}
          aria-label={t('hierarchy.stats.next')}
          disabled={isFuturePeriod(next)}
          onClick={() => setPeriod(next)}
        />
      </div>
    </div>
  );
}

function StatsBlock({
  loading,
  error,
  period,
  setPeriod,
}: {
  loading: boolean;
  error: boolean;
  period: Period;
  setPeriod: (p: Period) => void;
}) {
  const { t, i18n } = useTranslation();
  const ctx = useStats();
  const agg = ctx?.all;

  const kpi = (label: string, value: string, warn = false) => (
    <div className="kpi" style={{ padding: '12px 14px', ...(warn ? { background: 'var(--earth-50)' } : null) }}>
      <div className="lbl" style={{ fontSize: 11 }}>{label}</div>
      <div className="val" style={{ fontSize: 22, marginTop: 4, ...(warn ? { color: 'var(--earth-700)' } : null) }}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{t('hierarchy.stats.title')}</strong>
        <Button
          size="sm"
          iconL={<Icon name="download" size={14} />}
          disabled={!agg || agg.meetings === 0 || ctx.busy}
          title={agg && agg.meetings === 0 ? t('hierarchy.stats.journalEmpty') : undefined}
          onClick={() => ctx?.printJournal(null)}
        >
          {ctx?.busy ? t('hierarchy.stats.journalBusy') : t('hierarchy.stats.journal')}
        </Button>
      </div>
      <div style={{ marginTop: 10 }}>
        <PeriodPicker period={period} setPeriod={setPeriod} />
      </div>

      {loading ? (
        <p style={{ margin: '12px 0 0', color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</p>
      ) : error || !agg ? (
        <p style={{ margin: '12px 0 0', color: 'var(--ink-500)', fontSize: 13 }}>{t('hierarchy.stats.loadError')}</p>
      ) : (
        <>
          <div
            style={{
              display: 'grid', gap: 10, marginTop: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            }}
          >
            {kpi(t('hierarchy.stats.meetings'), String(agg.meetings))}
            {kpi(t('hierarchy.stats.active'), `${agg.active} / ${agg.total}`)}
            {kpi(t('hierarchy.stats.alert', { days: ALERT_DAYS }), String(agg.alertRows.length), agg.alertRows.length > 0)}
            {kpi(
              t('hierarchy.stats.average'),
              agg.average == null ? t('common.none') : agg.average.toLocaleString(i18n.language),
            )}
            {kpi(t('hierarchy.stats.distinct'), String(agg.distinctAttendees))}
            {kpi(t('hierarchy.stats.bread'), String(agg.breadBreaking))}
          </div>
          {agg.alertRows.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--earth-700)', display: 'flex', gap: 6 }}>
              <Icon name="warning" size={14} style={{ flex: 'none', marginTop: 2 }} />
              <span>{t('hierarchy.stats.alertList', { list: agg.alertRows.map((r) => r.unitName).join(', ') })}</span>
            </p>
          )}
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-400)' }}>{t('hierarchy.stats.hint')}</p>
        </>
      )}
    </div>
  );
}

/**
 * Résumé court d'un dirigeant dans l'arbre : « N assemblées · k ⚠ » (son sous-arbre). Sans
 * statistiques (module absent, membre, chargement), rend `children` (l'affichage d'avant).
 */
export function LeaderAssemblySummary({ node, children }: { node: LeaderHierarchyNode; children?: ReactNode }) {
  const { t } = useTranslation();
  const ctx = useStats();
  if (!ctx) return <>{children}</>;
  const agg = aggregate(subtreeUnitIds(node), ctx.statsById, ctx.today);
  if (agg.total === 0) return <>{children}</>;
  return (
    <span style={{ color: agg.alertRows.length > 0 ? 'var(--earth-700)' : 'var(--ink-500)' }}>
      {t('hierarchy.unitsCount', { count: agg.total })}
      {agg.alertRows.length > 0 && <> · {agg.alertRows.length} ⚠</>}
    </span>
  );
}

/** Bouton « Journal PDF » du sous-arbre d'un dirigeant ; désactivé sans réunion sur la période. */
export function LeaderJournalButton({ node }: { node: LeaderHierarchyNode }) {
  const { t } = useTranslation();
  const ctx = useStats();
  if (!ctx) return null;
  const agg = aggregate(subtreeUnitIds(node), ctx.statsById, ctx.today);
  if (agg.total === 0) return null;
  // D-ASM-18 (JP 08/10) : pas de nom de personne dans les libellés des stats.
  const label = t('hierarchy.stats.leaderJournal');
  return (
    <IconButton
      icon={<Icon name="download" size={14} />}
      aria-label={label}
      title={agg.meetings === 0 ? t('hierarchy.stats.journalEmpty') : label}
      disabled={agg.meetings === 0 || ctx.busy}
      onClick={() => ctx.printJournal(node)}
      style={{ marginRight: 10 }}
    />
  );
}

/**
 * Ligne d'une assemblée dans l'arbre : « Dernier CR il y a N j · X présents en moyenne » ou
 * « Aucun CR depuis 3 semaines » (⚠, terre). Clic → Vie d'assemblée présélectionnée sur elle.
 */
export function UnitAssemblyLine({ unitId, depth }: { unitId: string; depth: number }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ctx = useStats();
  const row = ctx?.statsById.get(unitId);
  if (!ctx || !row) return null;

  const alert = isAlert(row, ctx.today);
  const avg = averageAttendance(row.meetingCount, row.attendanceTotal);
  let text: string;
  if (alert) {
    text = t('hierarchy.stats.unitAlert', { days: ALERT_DAYS });
  } else {
    // Un CR daté dans le futur (saisie anticipée) ne doit pas afficher « il y a -N j ».
    const days = Math.max(0, daysBetween(row.lastMeetingDate!, ctx.today));
    text = days === 0 ? t('hierarchy.stats.lastToday') : t('hierarchy.stats.lastDays', { count: days });
    if (avg != null) text += ` · ${t('hierarchy.stats.unitAverage', { value: avg.toLocaleString(i18n.language) })}`;
  }

  return (
    <button
      type="button"
      onClick={() => navigate(`/assembly?unit=${encodeURIComponent(unitId)}`)}
      title={t('hierarchy.stats.openAssembly')}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        padding: '0 14px 6px', paddingLeft: 14 + depth * 22 + 24,
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit',
        fontSize: 12, color: alert ? 'var(--earth-700)' : 'var(--ink-500)',
      }}
    >
      {alert ? <Icon name="warning" size={12} /> : <Icon name="calendar" size={12} />}
      <span>{text}</span>
      <Icon name="arrowRight" size={12} />
    </button>
  );
}
