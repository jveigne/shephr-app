import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { hierarchyAccessDenied } from '../services/entitlementsApi';
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
//  Visible seulement avec l'abonnement ASSEMBLY (RG-06) et pour un non-MEMBRE.
//
//  Suite du lot « pro-plan » (JP 27/10, D-ABO-31 et suivantes) : ce bloc devient PAYANT — code
//  personnel `HIERARCHIE_SUIVI` (plan « Suivi de ma hiérarchie », un abonnement par dirigeant, pour
//  LUI-MÊME). Périmètre = la CHAÎNE de leadership de l'appelant (supervisor_id récursif), plus la
//  géographie de RG-ASM-05. `entitled` vient de `GET /entitlements/personal` ; un 403
//  `MODULE_ACCESS_DENIED` `HIERARCHIE_SUIVI` (droit expiré entre-temps) remonte par `onLocked` →
//  la page affiche le verrou, jamais un toast. Les CR, le journal et les réunions de SA propre
//  assemblée restent gratuits (Vie d'assemblée, `listMeetings(unitId)`).
//  D-OFF-04 / P-03 (JP 27/10, plan 05 — offre Caleb) : périmètre = la CHAÎNE seule (plus aucune
//  géographie) ; le journal consolidé ne reçoit plus que le nombre de présents (`attendeeCount`).
//  D-HIE-01 / D-HIE-10 (JP 28/10, lot HIE) : le bloc quitte la page 1 (« But quinquennal ») pour la
//  page 3 « Vie de mon leadership » (`pages/HierarchyLife.tsx`). La période est REMONTÉE dans la page
//  (un sélecteur unique pour tous les blocs) ; les résumés de CR des lignes de l'arbre en sortent et
//  deviennent la liste « Assemblées et dernier CR » (`AssemblyLastReportList`) ; le journal PDF de
//  toute la hiérarchie est un bouton de la page (`HierarchyJournalButton`).
// ---------------------------------------------------------------------------------------------

interface StatsContextValue {
  period: Period;
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
  entitled,
  onLocked,
  period,
  children,
}: {
  roots: LeaderHierarchyNode[];
  /** Mode CHAIN = vue d'un membre (sa chaîne de rattachement) : pas de statistiques. */
  isChain: boolean;
  /** Code personnel `HIERARCHIE_SUIVI` ouvert (serveur) — sinon aucun appel, aucun rendu. */
  entitled: boolean;
  /** 403 `HIERARCHIE_SUIVI` reçu malgré tout : la page bascule sur le verrou. */
  onLocked: () => void;
  /** D-HIE-01 (JP 28/10) : période choisie par la page (sélecteur unique de « Vie de mon leadership »). */
  period: Period;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const { push } = useToast();

  // RG-06 : même gating que Sidebar.tsx (abonnement ASSEMBLY + flag de livraison).
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const hasAssembly = FEATURES.assembly && (modulesQ.data ?? []).includes('ASSEMBLY');
  const enabled = entitled && hasAssembly && hasMinistryAccess(me) && !isChain && roots.length > 0;

  const { from, to } = periodRange(period);
  const today = todayIso();

  const statsQ = useQuery({
    queryKey: ['assembly', 'stats', from, to],
    queryFn: () => getAssemblyStats(from, to),
    enabled,
    retry: false,
  });

  // JP 27/10 : un 403 `HIERARCHIE_SUIVI` est un verrou, jamais une erreur affichée.
  const statsLocked = !!hierarchyAccessDenied(statsQ.error);
  useEffect(() => {
    if (statsLocked) onLocked();
  }, [statsLocked, onLocked]);

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
        .catch((err) => (hierarchyAccessDenied(err) ? onLocked() : push({ kind: 'error', title: t('assembly.journal.failed') })))
        .finally(() => setBusy(false));
    },
    [all, statsById, today, from, to, period, t, i18n.language, push, onLocked],
  );

  const value = useMemo<StatsContextValue | null>(
    () => (enabled && statsQ.data ? { period, today, statsById, all, busy, printJournal } : null),
    [enabled, statsQ.data, period, today, statsById, all, busy, printJournal],
  );

  return (
    <StatsContext.Provider value={value}>
      {enabled && !statsLocked && <StatsBlock loading={statsQ.isLoading} error={statsQ.isError} />}
      {children}
    </StatsContext.Provider>
  );
}

/**
 * Sélecteur de période : identique au journal mobile (Mois / Trimestre / Semestre / Année + ‹ ›).
 * Exporté pour le journal de la ville (offre Néhémie, D-OFF-05 — pages/CityStudy.tsx).
 */
export function PeriodPicker({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
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

function StatsBlock({ loading, error }: { loading: boolean; error: boolean }) {
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
      {/* D-HIE-01 (JP 28/10) : période et journal PDF sont portés par la page (sélecteur unique). */}
      <strong style={{ fontSize: 14 }}>{t('hierarchy.stats.title')}</strong>

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
 * D-HIE-01 (JP 28/10) — bouton « Journal PDF de ma hiérarchie » (toutes les assemblées de l'arbre,
 * sur la période de la page). Désactivé sans réunion ; rien hors périmètre (pas de statistiques).
 */
export function HierarchyJournalButton() {
  const { t } = useTranslation();
  const ctx = useStats();
  if (!ctx || ctx.all.total === 0) return null;
  const empty = ctx.all.meetings === 0;
  return (
    <Button
      iconL={<Icon name="download" size={14} />}
      disabled={empty || ctx.busy}
      title={empty ? t('hierarchy.stats.journalEmpty') : undefined}
      onClick={() => ctx.printJournal(null)}
    >
      {ctx.busy ? t('hierarchy.stats.journalBusy') : t('hierarchy.life.journal')}
    </Button>
  );
}

/**
 * D-HIE-01 (JP 28/10) — « Assemblées et dernier CR » : ce qui sortait des lignes d'assemblée de
 * l'arbre (payant). Une ligne par assemblée de l'arbre présente dans `/assembly/stats` : assemblée,
 * ville, dirigeant (nom de DIRIGEANT tiré de l'arbre, jamais un membre), dernier CR, réunions de la
 * période, alerte « sans CR depuis 3 semaines » (affichage seul, D-ASM-09). Clic → Vie d'assemblée.
 */
export function AssemblyLastReportList({ roots }: { roots: LeaderHierarchyNode[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ctx = useStats();
  const leaderByUnit = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (n: LeaderHierarchyNode) => {
      for (const u of n.units) if (!map.has(u.id)) map.set(u.id, n.fullName);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    return map;
  }, [roots]);
  if (!ctx) return null;
  const rows = ctx.all.rows;

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <strong style={{ fontSize: 14 }}>{t('hierarchy.life.unitsTitle')}</strong>
      {rows.length === 0 ? (
        <p style={{ margin: '10px 0 0', color: 'var(--ink-500)', fontSize: 13 }}>{t('hierarchy.life.unitsEmpty')}</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {rows.map((row) => {
            const alert = isAlert(row, ctx.today);
            const avg = averageAttendance(row.meetingCount, row.attendanceTotal);
            let last: string;
            if (row.lastMeetingDate == null) {
              last = t('hierarchy.life.noReport');
            } else {
              // Un CR daté dans le futur (saisie anticipée) ne doit pas afficher « il y a -N j ».
              const days = Math.max(0, daysBetween(row.lastMeetingDate, ctx.today));
              last = days === 0 ? t('hierarchy.stats.lastToday') : t('hierarchy.stats.lastDays', { count: days });
            }
            const leader = leaderByUnit.get(row.unitId);
            return (
              <button
                key={row.unitId}
                type="button"
                onClick={() => navigate(`/assembly?unit=${encodeURIComponent(row.unitId)}`)}
                title={t('hierarchy.stats.openAssembly')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', flexWrap: 'wrap',
                  padding: '9px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  font: 'inherit', borderTop: '1px solid var(--line-soft, rgba(42,38,32,0.08))',
                }}
              >
                <Icon name="unit" size={15} />
                <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{row.unitName}</span>
                  {row.cityName && <span style={{ color: 'var(--ink-500)', fontSize: 12 }}> · {row.cityName}</span>}
                  {leader && (
                    <span style={{ display: 'block', color: 'var(--ink-500)', fontSize: 12 }}>
                      {t('hierarchy.life.leader', { name: leader })}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-600)' }}>
                  {t('hierarchy.life.meetings', { count: row.meetingCount })}
                  {avg != null && ` · ${t('hierarchy.stats.unitAverage', { value: avg.toLocaleString(i18n.language) })}`}
                </span>
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5,
                    color: alert ? 'var(--earth-700)' : 'var(--ink-500)',
                  }}
                >
                  {alert ? <Icon name="warning" size={12} /> : <Icon name="calendar" size={12} />}
                  {last}
                  {alert && row.lastMeetingDate != null && <> · {t('hierarchy.stats.unitAlert')}</>}
                </span>
                <Icon name="arrowRight" size={12} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
