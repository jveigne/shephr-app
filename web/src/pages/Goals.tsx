import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { isSecretariat } from '../services/authApi';
import {
  addProgress,
  deleteProgress,
  fetchMembersAggregate,
  fetchMyMemberPledges,
  getActiveGoal,
  getAggregate,
  getGlobalSummary,
  getMyMemberProgress,
  getMyPerimeterAggregate,
  getMyUnits,
  getNations,
  getRegionsSummary,
  getTimeline,
  getUnitDetail,
  getZoneUnits,
  saveMemberPledge,
  sendMemberReminder,
  submitMyMemberPledges,
  unlockMemberPledges,
  updateProgress,
  updateYearDeadline,
  type ActiveGoal,
  type AggregateLevelPath,
  type GlobalSummary,
  type GoalCategory,
  type MemberStatusItem,
  type PerimeterLevelPath,
  type PledgeResponse,
  type ProgressResponse,
  type UnitPledgeDetail,
  type ZoneUnitStatus,
} from '../services/goalsApi';
import { listCountries, listLocalities, listZones } from '../services/adminApi';
import { NationsMap } from '../components/NationsMap';
import { GoalTimeline } from '../components/GoalTimeline';
import { YearPicker } from '../components/YearPicker';
import { currencySymbol, fmtAmount, fmtDateLabel, toLocalDate } from '../utils/format';

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** Code métier d'une 422 (`ApiError.error`) — ex. `DEADLINE_PASSED`, `PLEDGE_LOCKED`. */
const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;

/** « 7/12 » sans division par zéro (une assemblée peut n'avoir aucun membre rattaché). */
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Regroupement d'assemblées par ville (localityName) — clé stable même sans localityId. */
interface CityUnitsGroup {
  key: string;
  name: string | null;
  units: ZoneUnitStatus[];
}

function groupUnitsByCity(units: ZoneUnitStatus[]): CityUnitsGroup[] {
  const map = new Map<string, CityUnitsGroup>();
  for (const u of units) {
    const key = u.localityName ?? '__none__';
    let group = map.get(key);
    if (!group) {
      group = { key, name: u.localityName, units: [] };
      map.set(key, group);
    }
    group.units.push(u);
  }
  return [...map.values()];
}

/**
 * Données « MES engagements » — chargées seulement si l'utilisateur a un goalUnitId.
 *
 * <p>RG-BQ-11 : un dirigeant ne déclare plus pour son assemblée, il déclare SES engagements comme
 * tout le monde. Ce bloc lit donc `/member/me/**`, exactement comme l'espace membre.
 */
interface UnitData {
  pledges: PledgeResponse[];
  progressByPledge: Record<string, ProgressResponse[]>;
}

/** Ligne d'engagement par catégorie (UC-DIR-08). */
interface GoalLine {
  category: GoalCategory;
  pledge: PledgeResponse | null;
  achieved: number;
  target: number | null;
}

async function loadUnitData(year: number): Promise<UnitData> {
  // Un seul appel /member/me/progress remplace un listProgress par pledge.
  const [pledges, progress] = await Promise.all([
    fetchMyMemberPledges(year),
    getMyMemberProgress(year),
  ]);
  const progressByPledge: Record<string, ProgressResponse[]> = {};
  for (const p of progress) {
    (progressByPledge[p.pledgeId] ??= []).push(p);
  }
  return { pledges, progressByPledge };
}

/** Valeur formatée selon le type de la catégorie. */
function fmtCatValue(category: GoalCategory, value: number, currency: string): string {
  if (category.unitType === 'CURRENCY') return fmtAmount(value, currency);
  return `${value} ${category.unitLabel ?? ''}`.trim();
}

function fmtTarget(line: GoalLine, value: number, currency: string): string {
  if (line.category.unitType === 'CURRENCY') return fmtAmount(value, currency);
  return `${value} ${line.category.unitLabel ?? ''}`.trim();
}

/** Compteurs de soumission d'une assemblée, à la maille PERSONNE (RG-BQ-06). */
type UnitMemberCounts = {
  totalMembers: number;
  membersWithPledges: number;
  submittedMembers: number;
  lateMembers: number;
};

/**
 * Statut d'une assemblée — règle du contrat backend (javadoc de `ZoneUnitStatusResponse`) :
 * aucun engagement → Non démarré · tous les membres ont soumis → Soumis · sinon En cours.
 * Le retard est une pastille SÉPARÉE (`lateMembers > 0`), pas un statut concurrent.
 */
function UnitStatusBadges({ u }: { u: UnitMemberCounts }) {
  const { t } = useTranslation();
  const badge =
    u.membersWithPledges === 0 ? (
      <Badge tone="gray" dot>{t('goals.statusNotStarted')}</Badge>
    ) : u.totalMembers > 0 && u.submittedMembers === u.totalMembers ? (
      <Badge tone="ok" dot>{t('goals.submitted')}</Badge>
    ) : (
      <Badge tone="warn" dot>{t('goals.statusInProgress')}</Badge>
    );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {badge}
      {u.lateMembers > 0 && (
        <Badge tone="err" dot>{t('goals.lateMembers', { count: u.lateMembers })}</Badge>
      )}
    </span>
  );
}

/** « 7/12 membres ont soumis » — libellé unique, réutilisé partout où la maille est la personne. */
function MembersSubmittedRatio({ u }: { u: Pick<UnitMemberCounts, 'submittedMembers' | 'totalMembers'> }) {
  const { t } = useTranslation();
  return (
    <span>
      {t('goals.membersSubmittedRatio', {
        submitted: u.submittedMembers,
        total: u.totalMembers,
        percent: pct(u.submittedMembers, u.totalMembers),
      })}
    </span>
  );
}

export function GoalsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();

  // Lot 4.2 : le Goal actif est chargé pour tous ; les données « mon unité »
  // uniquement pour un DIRIGEANT rattaché (goalUnitId), les agrégats pour un
  // périmètre zone/pays (goalZoneId / goalCountryIds).
  const hasUnit = !!me?.goalUnitId;
  const zoneId = me?.goalZoneId ?? null;
  // Multi-rattachements (home + set) : toutes les régions / villes portées, principale en tête.
  const uniq = (home?: string | null, set?: string[] | null) => {
    const rest = (set ?? []).filter((id) => id !== home);
    return home ? [home, ...rest] : rest;
  };
  const zoneIds = uniq(me?.goalZoneId, me?.goalZoneIds);
  const cityIds = uniq(me?.goalCityId, me?.goalCityIds);
  const countryIds = me?.goalCountryIds ?? [];
  // Lot 4.8 — pays qu'un SECRETARIAT/LEADER coordonne explicitement (vue pays éditable comme un coordinateur).
  const coordinatedCountryIds = me?.coordinatedCountryIds ?? [];

  const goalQ = useQuery({ queryKey: ['goals', 'active'], queryFn: getActiveGoal, retry: false });

  // Annualisation (Lot 4.6) : année sélectionnée (défaut = année courante du Goal).
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? goalQ.data?.currentYear ?? null;

  const unitQ = useQuery({
    queryKey: ['goals', 'me', year],
    queryFn: () => loadUnitData(year!),
    enabled: hasUnit && year != null,
    retry: false,
  });
  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones(), enabled: zoneIds.length > 0 });
  const localitiesQ = useQuery({ queryKey: ['admin', 'localities'], queryFn: () => listLocalities(), enabled: cityIds.length > 0 });
  const countriesQ = useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: listCountries,
    enabled: countryIds.length > 0 || coordinatedCountryIds.length > 0,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['goals'] });

  const [editLine, setEditLine] = useState<GoalLine | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [editProgress, setEditProgress] = useState<{ progress: ProgressResponse; line: GoalLine } | null>(null);
  const [toDeleteProgress, setToDeleteProgress] = useState<ProgressResponse | null>(null);

  const goal = goalQ.data ?? null;
  const data = unitQ.data ?? null;
  const currency = goal?.defaultCurrency ?? 'EUR';
  // Lot G2 : deadline effective de l'année sélectionnée (repli legacy sur celle du Goal).
  const yearDeadline =
    (year != null ? goal?.yearDeadlines?.[String(year)] : null) ?? goal?.submissionDeadline ?? null;

  const lines: GoalLine[] = useMemo(() => {
    if (!goal || !data) return [];
    const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
    return categories.map((category) => {
      const pledge = data.pledges.find((p) => p.categoryId === category.id) ?? null;
      // Lot P1 (décision #13) : le versé = DERNIER état déclaré (progressDate puis createdAt),
      // pas la somme des saisies.
      const progresses = pledge ? data.progressByPledge[pledge.id] ?? [] : [];
      const achieved = progresses.length
        ? (() => {
            const latest = progresses.reduce((a, x) => {
              if (x.progressDate !== a.progressDate) return x.progressDate > a.progressDate ? x : a;
              return x.createdAt > a.createdAt ? x : a;
            });
            return latest.amount ?? latest.count ?? 0;
          })()
        : 0;
      return {
        category,
        pledge,
        achieved,
        target: pledge ? pledge.targetAmount ?? pledge.targetCount ?? null : null,
      };
    });
  }, [goal, data]);

  const submitted = (data?.pledges.length ?? 0) > 0 && (data?.pledges ?? []).every((p) => p.locked);
  const hasPledges = (data?.pledges.length ?? 0) > 0;

  const historyEntries = useMemo(
    () =>
      lines
        .filter((l) => l.pledge != null)
        .flatMap((l) =>
          (data?.progressByPledge[l.pledge!.id] ?? []).map((progress) => ({ progress, line: l })),
        )
        .sort((a, b) => {
          const d = b.progress.progressDate.localeCompare(a.progress.progressDate);
          return d !== 0 ? d : b.progress.createdAt.localeCompare(a.progress.createdAt);
        }),
    [lines, data],
  );

  // RG-BQ-06 : la soumission est INDIVIDUELLE — je soumets MES engagements, pas ceux d'une assemblée.
  const submitM = useMutation({
    mutationFn: () => submitMyMemberPledges(year ?? undefined),
    onSuccess: (res) => {
      invalidate();
      setSubmitOpen(false);
      push({
        kind: 'ok',
        title: t('goals.pledgesSubmittedToast'),
        msg: t('goals.lockedPledges', { count: res.lockedPledges }),
      });
    },
    onError: (err) => {
      // 422 métier : le message serveur est en FR et affichable, mais ces trois cas méritent
      // une formulation qui dit QUOI FAIRE.
      const code = errCode(err);
      push({
        kind: 'error',
        title: t('goals.submitRefused'),
        msg:
          code === 'NO_PLEDGE_TO_SUBMIT'
            ? t('memberGoals.noPledgeToSubmit')
            : code === 'ALREADY_SUBMITTED'
              ? t('memberGoals.alreadySubmitted')
              : code === 'DEADLINE_PASSED'
                ? t('goals.deadlinePassedHelp')
                : errMsg(err, t('goals.submitFailed')),
      });
    },
  });

  const deleteProgressM = useMutation({
    mutationFn: (id: string) => deleteProgress(id),
    onSuccess: () => {
      invalidate();
      setToDeleteProgress(null);
      push({ kind: 'ok', title: t('goals.progressDeleted') });
    },
    onError: (err) =>
      push({ kind: 'error', title: t('goals.deleteRefused'), msg: errMsg(err, t('goals.deleteFailed')) }),
  });

  // ---- Empty / error states (UC-DIR-08 A1) ----
  const error = (goalQ.error ?? unitQ.error) as
    | { response?: { status?: number; data?: { message?: string } } }
    | null;
  const noGoal = (goalQ.error as any)?.response?.status === 404;
  const hasPerimeter = zoneId != null || countryIds.length > 0;
  // Lot 4.3 : les rôles ministère-large (LEADER/SECRETARIAT) ont la vue globale.
  const ministryWide =
    (me?.superAdmin ?? false) || me?.goalRole === 'LEADER' || me?.goalRole === 'SECRETARIAT';
  // Lot V1 : la GESTION (deadline, années, drill-down complet) est la vue « Secrétariat » ;
  // un LEADER non-secrétariat a la « Présentation générale » (synthèse + carte, lecture).
  const isSecretariatView = (me?.superAdmin ?? false) || me?.goalRole === 'SECRETARIAT';
  const isCoordinatorView = countryIds.length > 0 || coordinatedCountryIds.length > 0;
  // Lot 3.5 : un dirigeant (sous-coordinateur) voit « Mon périmètre » = son SOUS-ARBRE (pas la zone géo).
  // Chantier 16/08 : le DIRIGEANT_UNITE y est ajouté — /me/aggregate et /me/units lui sont ouverts
  // côté backend, et sans eux il ne verrait jamais qui a soumis dans son assemblée.
  const showPerimeter =
    !!me
    && !me.superAdmin
    && (me.goalRole === 'DIRIGEANT_UNITE'
      || me.goalRole === 'DIRIGEANT'
      || me.goalRole === 'DIRIGEANT_SENIOR');
  const noScope = !hasUnit && !hasPerimeter && !ministryWide && !showPerimeter;

  const zoneName = zonesQ.data?.find((z) => z.id === zoneId)?.name ?? null;
  const countryName = (id: string) => countriesQ.data?.find((c) => c.id === id)?.name ?? null;

  const lineCols: Column<GoalLine & { id: string }>[] = [
    {
      label: t('goals.colCategory'),
      render: (l) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong>{l.category.name}</strong>
          <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
            {l.category.unitType === 'CURRENCY'
              ? t('goals.amountUnit', { symbol: currencySymbol(currency) })
              : t('goals.countUnit', { label: l.category.unitLabel ?? '—' })}
          </span>
        </div>
      ),
    },
    {
      label: t('goals.colPledged'),
      render: (l) => (l.target != null ? <strong>{fmtTarget(l, l.target, currency)}</strong> : '—'),
    },
    {
      label: t('goals.colPaid'),
      render: (l) => (l.pledge ? fmtTarget(l, l.achieved, currency) : '—'),
    },
    {
      label: t('goals.colProgress'),
      style: { width: 160 },
      render: (l) => {
        if (!l.pledge || l.target == null || l.target <= 0) return '—';
        // #5 : si le versé dépasse l'engagé, la barre DÉBORDE au-delà de 100% au lieu d'être plafonnée.
        // La piste représente max(100, %) ; vert jusqu'à l'objectif, segment earth au-delà, repère sur la ligne 100%.
        const rawPct = Math.round((l.achieved / l.target) * 100);
        const over = rawPct > 100;
        const denom = Math.max(100, rawPct);
        const basePct = (Math.min(rawPct, 100) / denom) * 100;
        const overPct = over ? ((rawPct - 100) / denom) * 100 : 0;
        const goalLinePct = (100 / denom) * 100;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                position: 'relative',
                flex: 1,
                height: 6,
                borderRadius: 99,
                background: 'rgba(42,38,32,0.08)',
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              <div
                style={{
                  width: `${basePct}%`,
                  height: '100%',
                  background: 'var(--green-600, #2E5142)',
                }}
              />
              {over && (
                <div
                  style={{
                    width: `${overPct}%`,
                    height: '100%',
                    background: 'var(--earth-600, #B07F54)',
                  }}
                />
              )}
              {over && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${goalLinePct}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: 'rgba(255,255,255,0.85)',
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 12,
                color: over ? 'var(--earth-700, #8E6B47)' : 'var(--ink-400)',
                fontWeight: over ? 600 : 400,
                minWidth: 32,
              }}
            >
              {rawPct}%
            </span>
          </div>
        );
      },
    },
    {
      label: t('goals.colStatus'),
      render: (l) =>
        l.pledge == null ? (
          <Badge tone="gray">{t('goals.toComplete')}</Badge>
        ) : l.pledge.locked ? (
          <Badge tone="ok" dot>{t('goals.submitted')}</Badge>
        ) : (
          <Badge tone="warn" dot>{t('goals.draft')}</Badge>
        ),
    },
    {
      // Lot G1.b : déclarant de l'engagement.
      label: t('goals.colDeclaredBy'),
      render: (l) => l.pledge?.createdByName ?? '—',
    },
    {
      label: '',
      style: { width: 70 },
      cellStyle: { textAlign: 'right' },
      render: (l) => {
        // RG-BQ-07/08 : l'éditabilité est SERVER-DRIVEN (`editable` intègre le verrou de
        // soumission ET la date limite, contournement SECRETARIAT/LEADER compris).
        const readOnly = l.pledge != null && l.pledge.editable === false;
        return (
          <IconButton
            icon={<Icon name={readOnly ? 'eye' : 'edit'} size={15} />}
            title={readOnly ? t('goals.consult') : t('goals.editTooltip')}
            onClick={() => setEditLine(l)}
          />
        );
      },
    },
  ];

  const historyCols: Column<{ id: string; progress: ProgressResponse; line: GoalLine }>[] = [
    { label: t('common.date'), render: (r) => fmtDateLabel(r.progress.progressDate) },
    { label: t('goals.colCategory'), render: (r) => r.line.category.name },
    {
      label: t('goals.colValue'),
      render: (r) => (
        <strong>
          {r.progress.amount != null && r.line.category.unitType === 'CURRENCY'
            ? fmtAmount(r.progress.amount, currency)
            : `+${r.progress.count ?? r.progress.amount ?? 0} ${r.line.category.unitLabel ?? ''}`.trim()}
        </strong>
      ),
    },
    {
      label: t('goals.colNote'),
      render: (r) =>
        r.progress.note ? <span style={{ fontStyle: 'italic' }}>{r.progress.note}</span> : '—',
    },
    {
      // Lot G1.b : auteur de l'avancement.
      label: t('goals.colRecordedBy'),
      render: (r) => r.progress.recordedByName ?? '—',
    },
    {
      label: '',
      style: { width: 90 },
      cellStyle: { textAlign: 'right' },
      render: (r) =>
        // Lot G2 : éditabilité server-driven (deadline de l'année) — plus de règle 24 h locale.
        r.progress.editable === true ? (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <IconButton
              icon={<Icon name="edit" size={15} />}
              title={t('goals.editProgressTooltip')}
              onClick={() => setEditProgress(r)}
            />
            <IconButton
              danger
              icon={<Icon name="trash" size={15} />}
              title={t('goals.deleteProgressTooltip')}
              onClick={() => setToDeleteProgress(r.progress)}
            />
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <TopBar
        title={t('goals.title')}
        crumbs={[t('common.brand'), t('goals.title')]}
        actions={
          <>
            {/* Lot G1.c : années visibles uniquement (JP 16/07 : le jalon final s'affiche « 2030 », sans libellé spécial). */}
            {goal && ((goal.visibleYears ?? goal.openYears)?.length ?? 0) > 0 && year != null && (
              <YearPicker
                years={goal.visibleYears ?? goal.openYears}
                value={year}
                onChange={setSelectedYear}
              />
            )}
            {hasPledges && (
              <>
                <Button iconL={<Icon name="plus" size={15} />} onClick={() => setProgressOpen(true)}>
                  {t('goals.addProgress')}
                </Button>
                {!submitted && (
                  <Button
                    variant="primary"
                    iconL={<Icon name="lock" size={15} />}
                    onClick={() => setSubmitOpen(true)}
                  >
                    {t('goals.submitMyPledges')}
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <div className="content">
        {goalQ.isLoading || (hasUnit && unitQ.isLoading) ? (
          <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
        ) : noGoal ? (
          <EmptyNote
            title={t('goals.noActiveGoal')}
            text={t('goals.noActiveGoalText')}
          />
        ) : noScope ? (
          <EmptyNote
            title={t('goals.notAttached')}
            text={t('goals.notAttachedText')}
          />
        ) : goalQ.isError || unitQ.isError ? (
          <EmptyNote title={t('goals.errorTitle')} text={errMsg(error, t('goals.loadPledgesFailed'))} />
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 4px' }}>{goal?.name}</h3>
              {/* Lot G2 : la date limite est PAR ANNÉE (yearDeadlines), mise en exergue. */}
              <p style={{ margin: 0, fontSize: 13.5 }}>
                {!hasUnit ? null : submitted ? (
                  <span style={{ color: 'var(--ink-400)' }}>
                    <Icon name="lock" size={12} /> {t('goals.pledgesSubmitted')}
                  </span>
                ) : yearDeadline ? (
                  new Date(yearDeadline).getTime() < Date.now() ? (
                    <strong style={{ color: 'var(--err, #B86A4A)' }}>
                      {t('goals.deadlinePast', { date: fmtDateLabel(yearDeadline.slice(0, 10)) })}
                    </strong>
                  ) : (
                    <strong style={{ color: 'var(--earth-700, #8E6B47)' }}>
                      {t('goals.submitBefore', { date: fmtDateLabel(yearDeadline.slice(0, 10)) })}
                    </strong>
                  )
                ) : null}
              </p>
              {goal && isSecretariatView && year != null && (
                <DeadlineEditor year={year} current={yearDeadline} />
              )}
            </div>

            {/* Mise en avant des engagements (JP 2026-07-10) : la vue globale — carte
                du monde en tête — s'affiche en premier pour les rôles ministère-large,
                pour « tomber sur la carte » à la connexion. */}
            {goal && ministryWide && year != null && (
              <>
                <ViewTitle label={isSecretariatView ? t('views.secretariat') : t('views.overview')} />
                <GlobalSummarySection goal={goal} currency={currency} year={year} drill={isSecretariatView} />
              </>
            )}

            {hasUnit && (
              <>
                {/* RG-BQ-11 : ce bloc, ce sont MES engagements personnels — un dirigeant déclare
                    dans SON assemblée, comme tout le monde. Il n'y a plus d'écran de saisie
                    « au nom de l'assemblée ». */}
                <ViewTitle label={t('views.unit')} />
                <Table
                  columns={lineCols}
                  rows={lines.map((l) => ({ ...l, id: l.category.id }))}
                  zebra
                />

                {/* Détail nominatif de MON assemblée : qui a déclaré, qui a soumis, qui est en
                    retard. Réservé aux dirigeants (403 pour un simple membre) — le bloc s'efface
                    proprement dans ce cas. */}
                {goal && year != null && me?.goalUnitId && (
                  <MembersGoalsBlock
                    unitId={me.goalUnitId}
                    goal={goal}
                    currency={currency}
                    year={year}
                  />
                )}

                <div style={{ marginTop: 28 }}>
                  <h3 style={{ margin: '0 0 10px' }}>{t('goals.historyTitle')}</h3>
                  <Table
                    columns={historyCols}
                    rows={historyEntries.map((e) => ({ ...e, id: e.progress.id }))}
                    zebra
                    empty={
                      <p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
                        {t('goals.noProgressRecorded')}
                      </p>
                    }
                  />
                </div>
              </>
            )}

            {goal && showPerimeter && year != null && (
              <>
                <ViewTitle label={t('views.leader')} />
                <MyPerimeterSection
                goal={goal}
                currency={currency}
                year={year}
                nodes={[
                  ...zoneIds.map((id) => ({ level: 'zones' as const, id, name: zonesQ.data?.find((z) => z.id === id)?.name ?? null })),
                  ...cityIds.map((id) => ({ level: 'cities' as const, id, name: localitiesQ.data?.find((l) => l.id === id)?.name ?? null })),
                ]}
                />
              </>
            )}

            {/* Lot V1 — vue Coordinateur : total de la Nation, puis totaux PAR RÉGION (borné à la Région).
                RG-BQ-02 : chaque total est la SOMME des engagements individuels dessous — plus de
                foi de nœud, plus de MAX à départager. */}
            {goal && year != null && isCoordinatorView && <ViewTitle label={t('views.coordinator')} />}
            {goal && year != null &&
              countryIds.map((id) => (
                <AggregateSection
                  key={id}
                  level="countries"
                  entityId={id}
                  year={year}
                  title={countryName(id) ? t('goals.myCountryNamed', { name: countryName(id) }) : t('goals.myCountry')}
                  goal={goal}
                  currency={currency}
                />
              ))}
            {goal && year != null &&
              countryIds.map((id) => (
                <NationRegionsBlock key={`regions-${id}`} nationId={id} year={year} goal={goal} currency={currency} />
              ))}

            {/* Lot 4.8 — pays sans coordinateur confiés à ce SECRETARIAT/LEADER (vue éditable). */}
            {goal && year != null &&
              coordinatedCountryIds
                .filter((id) => !countryIds.includes(id))
                .map((id) => (
                  <AggregateSection
                    key={`coord-${id}`}
                    level="countries"
                    entityId={id}
                    year={year}
                    title={countryName(id) ? t('goals.coordinatedCountryNamed', { name: countryName(id) }) : t('goals.coordinatedCountry')}
                    goal={goal}
                    currency={currency}
                  />
                ))}
            {goal && year != null &&
              coordinatedCountryIds
                .filter((id) => !countryIds.includes(id))
                .map((id) => (
                  <NationRegionsBlock key={`regions-coord-${id}`} nationId={id} year={year} goal={goal} currency={currency} />
                ))}
          </>
        )}
      </div>

      <PledgeFormModal
        line={editLine}
        currency={currency}
        year={year ?? undefined}
        onClose={() => setEditLine(null)}
        onSaved={() => {
          invalidate();
          setEditLine(null);
        }}
      />

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title={t('goals.submitModalTitle')}
        sub={t('goals.submitModalSub')}
        footer={
          <>
            <Button onClick={() => setSubmitOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={submitM.isPending}
              onClick={() => submitM.mutate()}
              iconL={<Icon name="lock" size={15} />}
            >
              {submitM.isPending ? t('goals.submitting') : t('goals.confirmAndSubmit')}
            </Button>
          </>
        }
      >
        <table style={{ width: '100%', fontSize: 14, borderSpacing: 0 }}>
          <tbody>
            {lines.map((l) => (
              <tr key={l.category.id}>
                <td style={{ padding: '6px 0', color: 'var(--ink-400)' }}>{l.category.name}</td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>
                  {l.target != null ? fmtTarget(l, l.target, currency) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      <ProgressFormModal
        open={progressOpen}
        lines={lines.filter((l) => l.pledge != null)}
        currency={currency}
        onClose={() => setProgressOpen(false)}
        onSaved={() => {
          invalidate();
          setProgressOpen(false);
        }}
      />

      <EditProgressModal
        entry={editProgress}
        currency={currency}
        onClose={() => setEditProgress(null)}
        onSaved={() => {
          invalidate();
          setEditProgress(null);
        }}
      />

      <Modal
        open={toDeleteProgress != null}
        onClose={() => setToDeleteProgress(null)}
        title={t('common.deleteTitle')}
        footer={
          <>
            <Button onClick={() => setToDeleteProgress(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={deleteProgressM.isPending}
              onClick={() => toDeleteProgress && deleteProgressM.mutate(toDeleteProgress.id)}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>{t('goals.deleteProgressConfirm')}</p>
      </Modal>
    </>
  );
}

function EmptyNote({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name="info" size={26} />
      </div>
      <h4>{title}</h4>
      <p>{text}</p>
    </div>
  );
}

/**
 * Saisie/édition de MON engagement sur une catégorie (CURRENCY ou COUNT). 0 = pas d'engagement.
 *
 * <p>Un seul appel, idempotent : `POST /member/me/pledges` (RG-BQ-01 — le seul chemin d'écriture).
 * Le champ est piloté par `PledgeResponse.editable`, jamais par un calcul local de date limite.
 */
function PledgeFormModal({
  line,
  currency,
  year,
  onClose,
  onSaved,
}: {
  line: GoalLine | null;
  currency: string;
  year?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [value, setValue] = useState('');
  const isCurrency = line?.category.unitType === 'CURRENCY';
  // Server-driven : `editable === false` = soumis OU date limite passée (le secrétariat, lui,
  // reçoit `editable === true` et garde la main).
  const locked = line?.pledge != null && line.pledge.editable === false;

  useEffect(() => {
    if (line) {
      const v = line.pledge ? line.pledge.targetAmount ?? line.pledge.targetCount : null;
      setValue(v != null ? String(v) : '');
    }
  }, [line]);

  const saveM = useMutation({
    mutationFn: async () => {
      const num = Number.parseFloat(value.replace(',', '.'));
      if (!Number.isFinite(num) || num < 0) throw new Error('invalid');
      const payload = isCurrency ? { targetAmount: num } : { targetCount: Math.round(num) };
      return saveMemberPledge({ categoryId: line!.category.id, year, ...payload });
    },
    onSuccess: () => {
      push({ kind: 'ok', title: t('goals.pledgeSaved') });
      onSaved();
    },
    onError: (err) => {
      const code = errCode(err);
      push({
        kind: 'error',
        title: t('goals.saveRefused'),
        msg: (err as Error).message === 'invalid'
          ? t('goals.invalidValue')
          : code === 'DEADLINE_PASSED'
            ? t('goals.deadlinePassedHelp')
            : code === 'PLEDGE_LOCKED'
              ? t('memberGoals.lockedAskSecretariat')
              : errMsg(err, t('goals.saveFailed')),
      });
    },
  });

  if (!line) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={line.category.name}
      sub={
        locked
          ? t('goals.pledgeLockedSub')
          : t('goals.pledgeEditableSub')
      }
      footer={
        locked ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </>
        )
      }
    >
      <Field
        label={
          isCurrency
            ? t('goals.pledgedAmount', { symbol: currencySymbol(currency) })
            : t('goals.pledgeCount', { label: line.category.unitLabel ?? t('goals.labelNumber') })
        }
        hint={locked ? undefined : t('goals.zeroMeansNoPledge')}
      >
        <Input
          value={value}
          disabled={locked}
          inputMode="decimal"
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
        />
      </Field>
    </Modal>
  );
}

/** Saisie d'un avancement (UC-DIR-12) : dépassement permis, 0/négatif refusé. */
function ProgressFormModal({
  open,
  lines,
  currency,
  onClose,
  onSaved,
}: {
  open: boolean;
  lines: GoalLine[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [categoryId, setCategoryId] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setCategoryId(lines[0]?.category.id ?? '');
      setValue('');
      setNote('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = lines.find((l) => l.category.id === categoryId) ?? null;
  const isCurrency = selected?.category.unitType === 'CURRENCY';

  const saveM = useMutation({
    mutationFn: async () => {
      const num = Number.parseFloat(value.replace(',', '.'));
      if (!Number.isFinite(num) || num <= 0) throw new Error('invalid');
      return addProgress(selected!.pledge!.id, {
        ...(isCurrency ? { amount: num } : { count: Math.round(num) }),
        progressDate: toLocalDate(new Date()),
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      push({ kind: 'ok', title: t('goals.progressSaved') });
      onSaved();
    },
    onError: (err) =>
      push({
        kind: 'error',
        title: t('goals.saveRefused'),
        msg: (err as Error).message === 'invalid'
          ? t('goals.valueAbove0')
          : errMsg(err, t('goals.saveFailed')),
      }),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('goals.progressModalTitle')}
      sub={t('goals.progressModalSub')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!selected || saveM.isPending}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={t('goals.colCategory')}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {lines.map((l) => (
              <option key={l.category.id} value={l.category.id}>
                {l.category.name}
              </option>
            ))}
          </Select>
        </Field>
        {selected && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-400)' }}>
            {t('goals.pledgedPaidRemaining', {
              pledged: selected.target != null ? fmtTarget(selected, selected.target, currency) : t('common.none'),
              paid: fmtTarget(selected, selected.achieved, currency),
              remaining:
                selected.target != null
                  ? fmtTarget(selected, Math.max(0, selected.target - selected.achieved), currency)
                  : t('common.none'),
            })}
          </p>
        )}
        <Field
          label={
            isCurrency
              ? t('goals.paidAmount', { symbol: currencySymbol(currency) })
              : t('goals.progressValue', { label: selected?.category.unitLabel ?? t('goals.labelNumber') })
          }
        >
          <Input
            value={value}
            inputMode="decimal"
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
          />
        </Field>
        <Field label={t('goals.noteOptional')}>
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Modification d'une déclaration d'état (UC-DIR-14 — auteur jusqu'à la deadline, secrétariat au-delà). */
function EditProgressModal({
  entry,
  currency,
  onClose,
  onSaved,
}: {
  entry: { progress: ProgressResponse; line: GoalLine } | null;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const isCurrency = entry?.line.category.unitType === 'CURRENCY';

  useEffect(() => {
    if (entry) {
      const v = entry.progress.amount ?? entry.progress.count;
      setValue(v != null ? String(v) : '');
      setNote(entry.progress.note ?? '');
    }
  }, [entry]);

  const saveM = useMutation({
    mutationFn: async () => {
      const num = Number.parseFloat(value.replace(',', '.'));
      if (!Number.isFinite(num) || num <= 0) throw new Error('invalid');
      return updateProgress(entry!.progress.id, {
        ...(isCurrency ? { amount: num } : { count: Math.round(num) }),
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      push({ kind: 'ok', title: t('goals.progressEdited') });
      onSaved();
    },
    onError: (err) =>
      push({
        kind: 'error',
        title: t('goals.editRefused'),
        msg: (err as Error).message === 'invalid'
          ? t('goals.valueAbove0')
          : errMsg(err, t('goals.editFailed')),
      }),
  });

  if (!entry) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('goals.editProgressTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field
          label={
            isCurrency
              ? t('goals.amountLabel', { symbol: currencySymbol(currency) })
              : t('goals.valueLabel', { label: entry.line.category.unitLabel ?? t('goals.labelNumber') })
          }
        >
          <Input
            value={value}
            inputMode="decimal"
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
          />
        </Field>
        <Field label={t('goals.noteOptional')}>
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Lot 3.5 — « Mon périmètre » : vue d'un dirigeant sous-coordinateur scopée à son SOUS-ARBRE
 * (et non à la zone géographique). Deux dirigeants d'une même zone voient des agrégats DISTINCTS.
 *
 * <p>RG-BQ-02 : ce n'est plus qu'une SOMME — plus d'engagement de foi à déclarer sur le nœud,
 * plus de comparaison à afficher.
 */
/** Nœud de périmètre d'un dirigeant : ville ou région portée (multi-rattachements). */
type PerimeterNode = { level: PerimeterLevelPath; id: string; name: string | null };

function MyPerimeterSection({
  goal, currency, year, nodes,
}: {
  goal: ActiveGoal;
  currency: string;
  year: number;
  /** Villes/régions portées (principale en tête) ; vide = dirigeant multi-unités (somme à plat). */
  nodes: PerimeterNode[];
}) {
  return (
    <div style={{ marginTop: 32 }}>
      {nodes.length === 0 ? (
        <PerimeterBlock goal={goal} currency={currency} year={year} node={null} />
      ) : (
        nodes.map((n) => (
          <PerimeterBlock key={n.id} goal={goal} currency={currency} year={year} node={n} />
        ))
      )}
      <ZoneUnitsBlock zoneId={null} goal={goal} currency={currency} year={year} perimeterScoped />
    </div>
  );
}

/**
 * Un bloc « Mon périmètre » : la SOMME des engagements des membres d'UN nœud (ville/région) —
 * ou la somme à plat de mon sous-arbre si `node` est null (`/me/aggregate`).
 */
function PerimeterBlock({
  goal, currency, year, node,
}: {
  goal: ActiveGoal;
  currency: string;
  year: number;
  node: PerimeterNode | null;
}) {
  const { t } = useTranslation();

  const aggQ = useQuery(node != null
    ? { queryKey: ['goals', 'aggregate', node.level, node.id, year], queryFn: () => getAggregate(node.level, node.id, year) }
    : { queryKey: ['goals', 'me-aggregate', year], queryFn: () => getMyPerimeterAggregate(year) });

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const lineByCat = new Map((aggQ.data ?? []).map((l) => [l.categoryId, l]));

  type AggRow = { id: string; category: GoalCategory };
  // RG-BQ-02 : UNE valeur par ligne. Les anciennes colonnes « Mon sous-arbre » / « Mon engagement »
  // / « Objectif retenu » (+ badge de source) fusionnent en une seule.
  const aggCols: Column<AggRow>[] = [
    { label: t('goals.colCategory'), render: (r) => <strong>{r.category.name}</strong> },
    {
      label: t('goals.colTotal'),
      render: (r) => {
        const line = lineByCat.get(r.category.id);
        return <strong>{fmtCatValue(r.category, line?.effectiveAmount ?? line?.effectiveCount ?? 0, currency)}</strong>;
      },
    },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 4px' }}>{node?.name ? t('goals.myPerimeterNamed', { name: node.name }) : t('goals.myPerimeter')}</h3>
      <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>
        {t('goals.myPerimeterIntro')}
      </p>
      {aggQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
      ) : aggQ.isError ? (
        <p style={{ color: 'var(--ink-400)' }}>{errMsg(aggQ.error, t('goals.perimeterInaccessible'))}</p>
      ) : (
        <Table columns={aggCols} rows={categories.map((c) => ({ id: c.id, category: c }))} zebra />
      )}
    </div>
  );
}

/**
 * Vue agrégée d'un niveau (ville / région / nation) — lecture seule.
 *
 * <p>RG-BQ-02 : une ligne = une valeur, la somme des engagements des membres du sous-arbre.
 * Plus de foi à déclarer, plus de badge de source, plus de MAX à départager.
 */
function AggregateSection({
  level,
  entityId,
  title,
  goal,
  currency,
  year,
}: {
  level: AggregateLevelPath;
  entityId: string;
  title: string;
  goal: ActiveGoal;
  currency: string;
  year: number;
}) {
  const { t } = useTranslation();

  const aggQ = useQuery({
    queryKey: ['goals', 'aggregate', level, entityId, year],
    queryFn: () => getAggregate(level, entityId, year),
  });

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const lineByCat = new Map((aggQ.data ?? []).map((l) => [l.categoryId, l]));

  type AggRow = { id: string; category: GoalCategory };
  const aggCols: Column<AggRow>[] = [
    { label: t('goals.colCategory'), render: (r) => <strong>{r.category.name}</strong> },
    {
      label: t('goals.colTotal'),
      render: (r) => {
        const line = lineByCat.get(r.category.id);
        return <strong>{fmtCatValue(r.category, line?.effectiveAmount ?? line?.effectiveCount ?? 0, currency)}</strong>;
      },
    },
  ];

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: '0 0 4px' }}>{title}</h3>
      <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>
        {t('goals.aggregateRule')}
      </p>
      {aggQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
      ) : aggQ.isError ? (
        <p style={{ color: 'var(--ink-400)' }}>{errMsg(aggQ.error, t('goals.aggregateInaccessible'))}</p>
      ) : (
        <Table columns={aggCols} rows={categories.map((c) => ({ id: c.id, category: c }))} zebra />
      )}

      {level === 'zones' && <ZoneUnitsBlock zoneId={entityId} goal={goal} currency={currency} year={year} />}
    </div>
  );
}

/**
 * Statut de soumission des assemblées de la zone (UC-LDR-06), à la maille PERSONNE.
 *
 * <p>RG-BQ-06 : « cette assemblée a-t-elle soumis ? » (booléen) est remplacé par « combien de ses
 * membres ont soumis ? » (compteur). Il n'y a plus de déverrouillage d'assemblée (l'endpoint
 * n'existe plus) : la réouverture est PAR PERSONNE, dans {@link MembersGoalsBlock}, qui porte
 * aussi le rappel nominatif.
 */
function ZoneUnitsBlock({
  zoneId, goal, currency, year, perimeterScoped = false,
}: { zoneId: string | null; goal: ActiveGoal; currency: string; year: number; perimeterScoped?: boolean }) {
  const { t } = useTranslation();
  const unitsQ = useQuery({
    queryKey: perimeterScoped ? ['goals', 'me-units', year] : ['goals', 'zone-units', zoneId, year],
    queryFn: () => (perimeterScoped ? getMyUnits(year) : getZoneUnits(zoneId!, year)),
  });
  const units = unitsQ.data ?? [];

  // Villes → assemblées (UC-LDR-06 bis) : dès que le périmètre couvre plusieurs villes, on
  // intercale un choix de ville avant la liste des assemblées (sinon liste directe, inchangée).
  const cityGroups = groupUnitsByCity(units);
  const showCityStep = cityGroups.length > 1;
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  useEffect(() => {
    setSelectedCity(null);
  }, [zoneId, perimeterScoped, year]);

  const activeUnits = showCityStep
    ? cityGroups.find((g) => g.key === selectedCity)?.units ?? []
    : units;
  // Maille PERSONNE : « tout est soumis » = chaque assemblée a des membres, et tous ont soumis.
  const allSubmitted =
    activeUnits.length > 0
    && activeUnits.every((u) => u.totalMembers > 0 && u.submittedMembers === u.totalMembers);

  const showingCityListPreview = showCityStep && selectedCity == null;
  // Résumé « comme un coordinateur » (UC-LDR-06 ter) : cumul + engagement effectif par catégorie,
  // par ville — sans le versé (pas d'endpoint bulk équivalent à getRegionsSummary pour les villes).
  const citiesLocalitiesQ = useQuery({
    queryKey: zoneId ? ['admin', 'localities', zoneId] : ['admin', 'localities'],
    queryFn: () => listLocalities(zoneId ? { zoneId } : {}),
    enabled: showingCityListPreview,
  });
  const localityIdByName = new Map((citiesLocalitiesQ.data ?? []).map((l) => [l.name, l.id]));
  const cityAggQueries = useQueries({
    queries: showingCityListPreview
      ? cityGroups.map((g) => {
          const localityId = g.name ? localityIdByName.get(g.name) : undefined;
          return {
            queryKey: ['goals', 'aggregate', 'cities', localityId, year],
            queryFn: () => getAggregate('cities', localityId!, year),
            enabled: localityId != null,
          };
        })
      : [],
  });
  const catsByOrder = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);

  // Lot 4.7 : détail (lecture seule) des engagements d'une unité du sous-arbre.
  const [detailUnit, setDetailUnit] = useState<ZoneUnitStatus | null>(null);
  const detailQ = useQuery({
    queryKey: ['goals', 'unit-detail', detailUnit?.unitId, year],
    queryFn: () => getUnitDetail(detailUnit!.unitId, year),
    enabled: detailUnit != null,
  });
  const catByCode = new Map(goal.categories.map((c) => [c.code, c]));

  const showingCityList = showCityStep && selectedCity == null;

  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: '0 0 8px' }}>
        {showingCityList ? t('goals.myCitiesStatus') : t('goals.myUnitsStatus')}
      </h4>
      {showCityStep && selectedCity != null && (
        <button
          type="button"
          onClick={() => setSelectedCity(null)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginBottom: 8,
            cursor: 'pointer',
            color: 'var(--green-700, #1E3A2F)',
            fontSize: 13,
            textDecoration: 'underline',
          }}
        >
          {t('goals.backToCities')}
        </button>
      )}
      {!showingCityList && allSubmitted && (
        <p style={{ margin: '0 0 8px', color: 'var(--green-600, #2E5142)', fontSize: 13 }}>
          {t('goals.allUnitsSubmitted')}
        </p>
      )}
      {unitsQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
      ) : showingCityList ? (
        <div>
          {cityGroups.map((g, i) => {
            // Maille PERSONNE : on somme les membres des assemblées de la ville, pas les assemblées.
            const submittedMembers = g.units.reduce((n, u) => n + u.submittedMembers, 0);
            const totalMembers = g.units.reduce((n, u) => n + u.totalMembers, 0);
            const lateMembers = g.units.reduce((n, u) => n + u.lateMembers, 0);
            const aggQ = cityAggQueries[i];
            const lineByCat = new Map((aggQ?.data ?? []).map((l) => [l.categoryId, l]));
            return (
              <div
                key={g.key}
                className="card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCity(g.key)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSelectedCity(g.key); }}
                style={{ padding: '12px 16px', marginBottom: 10, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <strong style={{ flex: 1 }}>{g.name ?? t('goals.noCityLabel')}</strong>
                  <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                    {t('goals.colAssemblies')} : {g.units.length}
                  </span>
                  <Badge
                    tone={
                      totalMembers > 0 && submittedMembers === totalMembers
                        ? 'ok'
                        : submittedMembers > 0
                          ? 'warn'
                          : 'gray'
                    }
                  >
                    {t('views.submittedRatio', {
                      submitted: submittedMembers,
                      total: totalMembers,
                      percent: pct(submittedMembers, totalMembers),
                    })}
                  </Badge>
                  {lateMembers > 0 && (
                    <Badge tone="err" dot>{t('goals.lateMembers', { count: lateMembers })}</Badge>
                  )}
                  <Icon name="chevRight" size={13} />
                </div>
                {citiesLocalitiesQ.isLoading || aggQ?.isLoading ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-400)' }}>{t('common.loading')}</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', fontSize: 13 }}>
                    {catsByOrder.map((cat) => {
                      const line = lineByCat.get(cat.id);
                      const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
                      return (
                        <span key={cat.id}>
                          <span style={{ color: 'var(--ink-400)' }}>{cat.name} : </span>
                          <strong>{fmtCatValue(cat, eff, currency)}</strong>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Table
          columns={[
            {
              label: t('common.unit'),
              render: (u: ZoneUnitStatus & { id: string }) => (
                <span>
                  <button
                    type="button"
                    onClick={() => setDetailUnit(u)}
                    title={t('goals.viewDetailTooltip')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--green-700, #1E3A2F)',
                      fontWeight: 600,
                      textDecoration: 'underline',
                    }}
                  >
                    {u.unitName}
                  </button>
                </span>
              ),
            },
            { label: t('common.locality'), render: (u) => u.localityName ?? '—' },
            {
              // RG-BQ-06 : le suivi est un compteur de PERSONNES, plus un booléen d'assemblée.
              label: t('goals.colMembersSubmitted'),
              render: (u) => <MembersSubmittedRatio u={u} />,
            },
            {
              // Lot G1.b : dirigeant de l'unité, à côté du statut.
              label: t('goals.colLeader'),
              render: (u) => u.leaderName ?? '—',
            },
            {
              label: t('goals.colStatus'),
              render: (u) => <UnitStatusBadges u={u} />,
            },
          ]}
          rows={activeUnits.map((u) => ({ ...u, id: u.unitId }))}
          zebra
          empty={
            <p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
              {t('goals.noUnitInZone')}
            </p>
          }
        />
      )}

      <Modal
        open={detailUnit != null}
        onClose={() => setDetailUnit(null)}
        title={t('goals.unitPledgesTitle', { name: detailUnit?.unitName ?? '' })}
        sub={t('goals.unitPledgesSub', { year })}
        size="lg"
        footer={<Button onClick={() => setDetailUnit(null)}>{t('common.close')}</Button>}
      >
        {detailQ.isLoading ? (
          <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
        ) : (
          <>
          {detailQ.data?.[0]?.leaderName && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-500, #4A443B)' }}>
              {t('goals.unitLeaderInline', { name: detailQ.data[0].leaderName })}
            </p>
          )}
          <table style={{ width: '100%', fontSize: 14, borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-400)', fontSize: 12 }}>
                <th style={{ padding: '4px 8px' }}>{t('goals.colCategory')}</th>
                {/* RG-BQ-02 : ce n'est plus une déclaration de dirigeant mais la Σ des membres. */}
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('goals.colMembersSum')}</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('goals.colPaid')}</th>
              </tr>
            </thead>
            <tbody>
              {(detailQ.data ?? []).map((d: UnitPledgeDetail) => {
                const cat = catByCode.get(d.categoryCode);
                const label = cat?.name ?? d.categoryCode;
                const engaged =
                  d.unitType === 'CURRENCY'
                    ? d.targetAmount != null
                      ? fmtAmount(d.targetAmount, goal.defaultCurrency)
                      : '—'
                    : d.targetCount != null
                    ? `${d.targetCount} ${cat?.unitLabel ?? ''}`.trim()
                    : '—';
                const achieved =
                  d.unitType === 'CURRENCY'
                    ? fmtAmount(d.achievedAmount ?? 0, goal.defaultCurrency)
                    : `${d.achievedCount ?? 0} ${cat?.unitLabel ?? ''}`.trim();
                return (
                  <tr key={d.categoryId} style={{ borderTop: '1px solid var(--line, rgba(42,38,32,0.08))' }}>
                    <td style={{ padding: '8px' }}>
                      {label}
                      {/* `locked` = TOUS les engagements des membres de cette catégorie sont soumis. */}
                      {d.locked && <Icon name="lock" size={11} />}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{engaged}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--ink-400)' }}>{achieved}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* RG-BQ-05 — le drill-down descend jusqu'au MEMBRE : sans ce bloc, un dirigeant de
              ville ou de région n'aurait ici que des totaux, sans savoir QUI relancer. */}
          {detailUnit && (
            <MembersGoalsBlock unitId={detailUnit.unitId} goal={goal} currency={currency} year={year} />
          )}
          </>
        )}
      </Modal>
    </div>
  );
}

/** Lot V1 — intitulé de vue nommée (Présentation générale / Secrétariat / Coordinateur / Dirigeant / Unité). */
function ViewTitle({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 10px' }}>
      <Badge tone="earth">{t('views.badge')}</Badge>
      <h2 style={{ margin: 0, fontSize: 18 }}>{label}</h2>
    </div>
  );
}

/**
 * Lot V1 — vue COORDINATEUR : cumuls d'une Nation détaillés PAR RÉGION + somme totale.
 * Le drill-down du coordinateur s'arrête à la Région (pas de descente Ville/Assemblée).
 */
function NationRegionsBlock({
  nationId, year, goal, currency,
}: {
  nationId: string;
  year: number;
  goal: ActiveGoal;
  currency: string;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['goals', 'regions-summary', nationId, year],
    queryFn: () => getRegionsSummary(nationId, year),
  });
  const data = q.data ?? null;
  const catByCode = new Map(goal.categories.map((c) => [c.code, c]));
  if (q.isLoading) return <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>;
  if (!data) return null;
  const levelLabel = data.regionLabel === 'STATE' ? t('views.statesHeading') : t('views.regionsHeading');
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ margin: '0 0 4px' }}>{levelLabel}{data.nationName ? ` — ${data.nationName}` : ''}</h3>
      <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>{t('views.regionsIntro')}</p>
      {data.regions.map((r) => (
        <div key={r.regionId} className="card" style={{ padding: '12px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <strong>{r.regionName}</strong>
            {/* Maille PERSONNE (RG-BQ-06) : `submissionRate` est re-maillé côté serveur. */}
            <Badge tone={r.submissionRate >= 1 ? 'ok' : r.submittedMembers > 0 ? 'warn' : 'gray'}>
              {t('views.submittedRatio', {
                submitted: r.submittedMembers,
                total: r.totalMembers,
                percent: Math.round(r.submissionRate * 100),
              })}
            </Badge>
            {r.lateMembers > 0 && (
              <Badge tone="err" dot>{t('goals.lateMembers', { count: r.lateMembers })}</Badge>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', fontSize: 13 }}>
            {r.lines.map((l) => {
              const cat = catByCode.get(l.categoryCode);
              const effective = l.unitType === 'CURRENCY'
                ? fmtAmount(l.effectiveAmount ?? 0, currency)
                : `${l.effectiveCount ?? 0} ${cat?.unitLabel ?? ''}`.trim();
              const achieved = l.unitType === 'CURRENCY'
                ? fmtAmount(l.achieved ?? 0, currency)
                : `${l.achieved ?? 0} ${cat?.unitLabel ?? ''}`.trim();
              return (
                <span key={l.categoryId}>
                  <span style={{ color: 'var(--ink-400)' }}>{cat?.name ?? l.categoryCode} : </span>
                  <strong>{effective}</strong>
                  <span style={{ color: 'var(--ink-400)' }}> · {t('views.achievedInline', { value: achieved })}</span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <div className="card" style={{ padding: '12px 16px', background: 'var(--paper-2, #F7F4EE)' }}>
        <div style={{ marginBottom: 6 }}><strong>{t('views.nationTotal')}</strong></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', fontSize: 13 }}>
          {data.totals.map((l) => {
            const cat = catByCode.get(l.categoryCode);
            const effective = l.unitType === 'CURRENCY'
              ? fmtAmount(l.effectiveAmount ?? 0, currency)
              : `${l.effectiveCount ?? 0} ${cat?.unitLabel ?? ''}`.trim();
            const achieved = l.unitType === 'CURRENCY'
              ? fmtAmount(l.achieved ?? 0, currency)
              : `${l.achieved ?? 0} ${cat?.unitLabel ?? ''}`.trim();
            return (
              <span key={l.categoryId}>
                <span style={{ color: 'var(--ink-400)' }}>{cat?.name ?? l.categoryCode} : </span>
                <strong>{effective}</strong>
                <span style={{ color: 'var(--ink-400)' }}> · {t('views.achievedInline', { value: achieved })}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Lot G2 : édition de la date limite d'envoi de l'année sélectionnée —
 * visible uniquement pour les rôles ministère-large (SECRETARIAT/LEADER/SUPER_ADMIN).
 */
function DeadlineEditor({ year, current }: { year: number; current: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(current ? current.slice(0, 16) : '');
  }, [current, year]);

  const saveM = useMutation({
    mutationFn: () => updateYearDeadline(year, value ? `${value}:00` : null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setOpen(false);
      push({ kind: 'ok', title: t('goals.deadlineSaved', { year }) });
    },
    onError: (err) =>
      push({ kind: 'error', title: t('goals.deadlineSaveFailed'), msg: errMsg(err, '') }),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          marginTop: 4,
          cursor: 'pointer',
          fontSize: 12.5,
          color: 'var(--green-700, #1E3A2F)',
          textDecoration: 'underline',
        }}
      >
        {t('goals.editDeadline', { year })}
      </button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <input
        type="datetime-local"
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ fontSize: 13, padding: '4px 8px' }}
      />
      <Button size="sm" variant="primary" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
        {saveM.isPending ? t('common.saving') : t('common.save')}
      </Button>
      <Button size="sm" onClick={() => setOpen(false)}>
        {t('common.cancel')}
      </Button>
    </span>
  );
}

/** Résumé global du ministère par continent (UC-SEC-01, Lot 4.3) — LEADER/SECRETARIAT/SA. */
/** Étape du drill-down SECRETARIAT (UC-SEC-02, Lot 4.5). */
interface DrillStep {
  level: 'continents' | 'countries' | 'zones' | 'cities' | 'units';
  id: string;
  name: string;
  /** Zone parente — portée par l'étape 'cities' pour filtrer les assemblées de cette ville. */
  parentZoneId?: string;
  /** Statut soumission porté depuis la liste des unités (niveau unité uniquement). */
  unitStatus?: ZoneUnitStatus;
}

function GlobalSummarySection({ goal, currency, year, drill = true }: { goal: ActiveGoal; currency: string; year: number; drill?: boolean }) {
  const { t } = useTranslation();
  const summaryQ = useQuery({
    queryKey: ['goals', 'global', 'summary', year],
    queryFn: () => getGlobalSummary(year),
  });
  const summary = summaryQ.data ?? null;

  // Lot 7.1 — carte du monde (#6) : statut de soumission par nation.
  const nationsQ = useQuery({
    queryKey: ['goals', 'global', 'nations', year],
    queryFn: () => getNations(year),
  });

  // Lot 4.5 — navigation hiérarchique en lecture seule (continent → pays → zone → unité).
  const [path, setPath] = useState<DrillStep[]>([]);

  const catById = new Map(goal.categories.map((c) => [c.id, c]));
  const fmtLine = (categoryId: string, v: number | null | undefined) => {
    const cat = catById.get(categoryId);
    const value = v ?? 0;
    if (!cat) return String(value);
    return fmtCatValue(cat, value, currency);
  };

  if (path.length > 0) {
    return (
      <div style={{ marginTop: 32 }}>
        <h3 style={{ margin: '0 0 4px' }}>{t('goals.globalView')}</h3>
        <DrillView goal={goal} currency={currency} year={year} path={path} setPath={setPath} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: '0 0 4px' }}>{t('goals.globalView')}</h3>

      {/* Lot 7.1 — carte du monde + nations en retard (cliquer un pays = drill-down). */}
      {nationsQ.data && nationsQ.data.nations.length > 0 && (
        <div style={{ margin: '8px 0 20px' }}>
          <NationsMap
            nations={nationsQ.data.nations}
            deadlinePast={nationsQ.data.deadlinePast}
            onSelectCountry={drill ? (id, name) => setPath([{ level: 'countries', id, name }]) : undefined}
          />
        </div>
      )}

      {summaryQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
      ) : summaryQ.isError ? (
        <p style={{ color: 'var(--ink-400)' }}>
          {errMsg(summaryQ.error, t('goals.globalSummaryInaccessible'))}
        </p>
      ) : summary ? (
        <>
          {/* RG-BQ-06 : maille PERSONNE. `totalUnits` reste un décompte d'assemblées, il ne se
              mélange plus au ratio de soumission. */}
          <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>
            {t('goals.membersSubmittedRatioLong', {
              submitted: summary.submittedMembers,
              total: summary.totalMembers,
              percent:
                summary.totalMembers > 0
                  ? t('goals.percent', { value: pct(summary.submittedMembers, summary.totalMembers) })
                  : '',
            })}
            {summary.lateMembers > 0 && (
              <>
                {' '}
                <strong style={{ color: 'var(--err, #B86A4A)' }}>
                  {t('goals.lateMembers', { count: summary.lateMembers })}
                </strong>
              </>
            )}
          </p>
          <Table
            columns={[
              {
                label: t('goals.colCategory'),
                render: (l: GlobalSummary['totals'][number] & { id: string }) => (
                  <strong>{catById.get(l.categoryId)?.name ?? l.categoryCode}</strong>
                ),
              },
              {
                label: t('goals.colEffectivePledged'),
                render: (l) => fmtLine(l.categoryId, l.effectiveAmount ?? l.effectiveCount),
              },
              { label: t('goals.colPaid'), render: (l) => fmtLine(l.categoryId, l.achieved) },
            ]}
            rows={summary.totals.map((l) => ({ ...l, id: l.categoryId }))}
            zebra
          />
          {summary.continents.map((continent) => (
            <div key={continent.continentId} style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
                {continent.name}{' '}
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--ink-400)' }}>
                  {t('goals.continentSubmitted', {
                    submitted: continent.submittedMembers,
                    total: continent.totalMembers,
                    units: continent.totalUnits,
                  })}
                </span>
                {drill && (
                  <Button
                    size="sm"
                    iconR={<Icon name="arrowRight" size={13} />}
                    onClick={() =>
                      setPath([{ level: 'continents', id: continent.continentId, name: continent.name }])
                    }
                  >
                    {t('goals.explore')}
                  </Button>
                )}
              </h4>
              <Table
                columns={[
                  {
                    label: t('goals.colCategory'),
                    render: (l: GlobalSummary['totals'][number] & { id: string }) =>
                      catById.get(l.categoryId)?.name ?? l.categoryCode,
                  },
                  {
                    label: t('goals.colEffectivePledged'),
                    render: (l) => fmtLine(l.categoryId, l.effectiveAmount ?? l.effectiveCount),
                  },
                  { label: t('goals.colPaid'), render: (l) => fmtLine(l.categoryId, l.achieved) },
                ]}
                rows={continent.lines.map((l) => ({ ...l, id: l.categoryId }))}
              />
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

/** Vue d'un niveau du drill-down : breadcrumb + agrégats + enfants navigables (UC-SEC-02). */
function DrillView({
  goal,
  currency,
  year,
  path,
  setPath,
}: {
  goal: ActiveGoal;
  currency: string;
  year: number;
  path: DrillStep[];
  setPath: (p: DrillStep[]) => void;
}) {
  const { t } = useTranslation();
  const current = path[path.length - 1];

  const crumbStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'var(--green-700, #1E3A2F)',
    fontSize: 13,
    textDecoration: 'underline',
  };

  return (
    <>
      <p style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={crumbStyle} onClick={() => setPath([])}>
          {t('goals.globalViewLink')}
        </button>
        {path.map((step, i) => (
          <span key={step.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="chevRight" size={11} />
            {i === path.length - 1 ? (
              <strong style={{ fontSize: 13 }}>{step.name}</strong>
            ) : (
              <button type="button" style={crumbStyle} onClick={() => setPath(path.slice(0, i + 1))}>
                {step.name}
              </button>
            )}
          </span>
        ))}
      </p>

      {current.level === 'units' && current.unitStatus && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {current.unitStatus.localityName
            ? <span>{t('goals.localityPrefix', { name: current.unitStatus.localityName })}</span>
            : null}
          <MembersSubmittedRatio u={current.unitStatus} />
          <UnitStatusBadges u={current.unitStatus} />
        </p>
      )}

      <LevelAggregateBlock goal={goal} currency={currency} year={year} level={current.level} entityId={current.id} />

      {current.level === 'continents' && (
        <DrillCountries continentId={current.id} onOpen={(id, name) => setPath([...path, { level: 'countries', id, name }])} />
      )}
      {current.level === 'countries' && (
        <DrillZones countryId={current.id} onOpen={(id, name) => setPath([...path, { level: 'zones', id, name }])} />
      )}
      {current.level === 'zones' && (
        <DrillCities
          zoneId={current.id}
          year={year}
          onOpen={(id, name) => setPath([...path, { level: 'cities', id, name, parentZoneId: current.id }])}
        />
      )}
      {current.level === 'cities' && (
        <DrillUnits
          zoneId={current.parentZoneId!}
          year={year}
          cityName={current.name}
          onOpen={(u) => setPath([...path, { level: 'units', id: u.unitId, name: u.unitName, unitStatus: u }])}
        />
      )}
    </>
  );
}

/** Totaux par catégorie d'un niveau — somme des engagements individuels dessous (lecture seule). */
function LevelAggregateBlock({
  goal,
  currency,
  year,
  level,
  entityId,
}: {
  goal: ActiveGoal;
  currency: string;
  year: number;
  level: AggregateLevelPath;
  entityId: string;
}) {
  const { t } = useTranslation();
  const aggQ = useQuery({
    queryKey: ['goals', 'aggregate', level, entityId, year],
    queryFn: () => getAggregate(level, entityId, year),
  });
  // Lot 7.1 — évolution dans le temps (versé cumulé par mois) à CE niveau.
  const timelineQ = useQuery({
    queryKey: ['goals', 'timeline', level, entityId, year],
    queryFn: () => getTimeline(level, entityId, year),
  });

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const lineByCat = new Map((aggQ.data ?? []).map((l) => [l.categoryId, l]));

  if (aggQ.isLoading) return <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>;
  if (aggQ.isError) {
    return <p style={{ color: 'var(--ink-400)' }}>{errMsg(aggQ.error, t('goals.aggregateInaccessible'))}</p>;
  }

  return (
    <>
      <Table
        columns={[
          {
            label: t('goals.colCategory'),
            render: (r: { id: string; category: GoalCategory }) => <strong>{r.category.name}</strong>,
          },
          {
            // RG-BQ-02 : une seule colonne de valeur — la somme des engagements des membres.
            label: t('goals.colTotal'),
            render: (r) => {
              const line = lineByCat.get(r.category.id);
              return <strong>{fmtCatValue(r.category, line?.effectiveAmount ?? line?.effectiveCount ?? 0, currency)}</strong>;
            },
          },
        ]}
        rows={categories.map((c) => ({ id: c.id, category: c }))}
        zebra
      />

      {/* RG-BQ-05 — le drill-down descend jusqu'au MEMBRE : au niveau assemblée, on ouvre le
          détail nominatif (qui a déclaré, qui a soumis, qui est en retard). */}
      {level === 'units' && (
        <MembersGoalsBlock unitId={entityId} goal={goal} currency={currency} year={year} />
      )}

      {/* Lot 7.1 — courbe d'évolution cumulée du versé, par catégorie, à ce niveau. */}
      {timelineQ.data && timelineQ.data.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: '0 0 8px' }}>{t('goals.paidEvolution')}</h4>
          <GoalTimeline
            data={timelineQ.data}
            format={(categoryId, unitType) => {
              const cat = goal.categories.find((c) => c.id === categoryId);
              return (v: number) =>
                cat
                  ? fmtCatValue(cat, v, currency)
                  : unitType === 'CURRENCY'
                    ? fmtAmount(v, currency)
                    : String(v);
            }}
          />
        </div>
      )}
    </>
  );
}

/**
 * « Objectifs des membres » d'une assemblée — le cœur du modèle individuel (RG-BQ-05/06).
 *
 * <p>Deux tableaux :
 * <ul>
 *   <li>par catégorie : UNE valeur, la somme des engagements des membres ;</li>
 *   <li>par PERSONNE : construit sur `roster` (donc y compris ceux qui n'ont RIEN déclaré — ce
 *       sont précisément ceux qu'un dirigeant doit relancer), croisé avec `lines[].members`
 *       pour les valeurs.</li>
 * </ul>
 *
 * <p>Masqué proprement si le backend refuse (403 : hors périmètre, ou simple membre sur sa propre
 * assemblée — celui-ci a `/me/assembly`, anonyme).
 */
function MembersGoalsBlock({
  unitId, goal, currency, year,
}: {
  unitId: string;
  goal: ActiveGoal;
  currency: string;
  year: number;
}) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['goals', 'members-aggregate', unitId, year],
    queryFn: () => fetchMembersAggregate(unitId, year),
    retry: false,
  });

  // Les compteurs « 7/12 » vivent aussi dans /me/units et /zones/{id}/units : on invalide
  // le préfixe ['goals'] pour ne pas laisser un chiffre périmé à l'écran.
  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ['goals'] });

  // Réouverture des objectifs d'un membre : SECRETARIAT / superAdmin (le backend refait le contrôle).
  const canUnlockMembers = isSecretariat(me) || (me?.superAdmin ?? false);
  const unlockM = useMutation({
    mutationFn: (memberId: string) => unlockMemberPledges(memberId, year),
    onSuccess: () => {
      invalidateAll();
      push({ kind: 'ok', title: t('goals.memberUnlocked') });
    },
    onError: (err) =>
      push({ kind: 'error', title: t('goals.unlockRefused'), msg: errMsg(err, t('common.error')) }),
  });

  // RG-BQ-06 : le rappel cible une PERSONNE non soumise, plus une assemblée.
  const [reminderTarget, setReminderTarget] = useState<MemberStatusItem | null>(null);
  const [reminderMsg, setReminderMsg] = useState('');
  const openReminder = (m: MemberStatusItem) => {
    const deadline = goal.submissionDeadline
      ? t('goals.reminderDeadline', { date: fmtDateLabel(goal.submissionDeadline.slice(0, 10)) })
      : '';
    setReminderMsg(t('goals.reminderDefaultMessage', { deadline }));
    setReminderTarget(m);
  };
  const reminderM = useMutation({
    mutationFn: () => sendMemberReminder(reminderTarget!.userId, reminderMsg.trim() || undefined),
    onSuccess: (res) => {
      setReminderTarget(null);
      push({
        kind: 'ok',
        title: t('goals.reminderSent'),
        msg: res.sentToName ? t('goals.reminderSentTo', { name: res.sentToName }) : undefined,
      });
    },
    onError: (err) => {
      const code = errCode(err);
      push({
        kind: 'error',
        title: t('goals.reminderNotSent'),
        msg:
          code === 'REMINDER_ALREADY_SENT'
            ? t('goals.reminderAlreadySent')
            : code === 'MEMBER_ALREADY_SUBMITTED'
              ? t('goals.reminderAlreadySubmitted')
              : errMsg(err, t('goals.reminderSendFailed')),
      });
    },
  });

  if (q.isLoading) {
    return <p style={{ margin: '10px 0 0', color: 'var(--ink-400)', fontSize: 13 }}>{t('common.loading')}</p>;
  }
  if (q.isError || !q.data) return null;

  const data = q.data;
  const catById = new Map(goal.categories.map((c) => [c.id, c]));
  const lines = [...data.lines].sort(
    (a, b) => (catById.get(a.categoryId)?.displayOrder ?? 0) - (catById.get(b.categoryId)?.displayOrder ?? 0),
  );

  const fmt = (categoryId: string, value: number | null | undefined) => {
    const cat = catById.get(categoryId);
    return cat ? fmtCatValue(cat, value ?? 0, currency) : String(value ?? 0);
  };

  // Valeurs déclarées, indexées par personne puis catégorie (les non-déclarants n'y sont pas).
  const valuesByMember = new Map<string, Map<string, number | null>>();
  for (const line of lines) {
    for (const m of line.members) {
      const values = valuesByMember.get(m.userId) ?? new Map<string, number | null>();
      values.set(line.categoryId, m.amount ?? m.count);
      valuesByMember.set(m.userId, values);
    }
  }

  // ⚠ On part du ROSTER (les PERSONNES), pas des engagements : sans ça, les membres qui n'ont
  // rien déclaré seraient invisibles — or ce sont eux qu'il faut relancer.
  const roster = data.roster ?? [];
  const memberRows = roster.map((m) => ({
    id: m.userId,
    member: m,
    values: valuesByMember.get(m.userId) ?? new Map<string, number | null>(),
  }));
  type MemberRow = (typeof memberRows)[number];

  type Line = (typeof lines)[number];
  // RG-BQ-02 : les trois colonnes d'antan (agrégat des fidèles / engagement du dirigeant /
  // retenu MAX + badge de source) fusionnent en UNE valeur.
  const aggCols: Column<Line & { id: string }>[] = [
    {
      label: t('goals.colCategory'),
      render: (l) => <strong>{catById.get(l.categoryId)?.name ?? l.categoryCode}</strong>,
    },
    {
      label: t('goals.colTotal'),
      render: (l) => <strong>{fmt(l.categoryId, l.effectiveAmount ?? l.effectiveCount)}</strong>,
    },
  ];

  const memberCols: Column<MemberRow>[] = [
    { label: t('goals.colMember'), render: (r) => <strong>{r.member.fullName}</strong> },
    ...lines.map((l) => ({
      label: catById.get(l.categoryId)?.name ?? l.categoryCode,
      render: (r: MemberRow) => {
        const v = r.values.get(l.categoryId);
        return v != null ? fmt(l.categoryId, v) : <span style={{ color: 'var(--ink-400)' }}>—</span>;
      },
    } as Column<MemberRow>)),
    {
      label: t('goals.colStatus'),
      cellStyle: { textAlign: 'right' },
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {r.member.submitted ? (
            <Badge tone="ok" dot>{t('goals.submitted')}</Badge>
          ) : r.member.hasPledges ? (
            <Badge tone="warn" dot>{t('goals.draft')}</Badge>
          ) : (
            <Badge tone="gray" dot>{t('goals.statusNotStarted')}</Badge>
          )}
          {r.member.late && <Badge tone="err" dot>{t('goals.late')}</Badge>}
          {/* Décision JP 28/07 : le membre passe par le secrétariat pour corriger après coup. */}
          {r.member.submitted && canUnlockMembers && (
            <Button
              size="sm"
              variant="ghost"
              title={t('goals.unlockMemberTooltip')}
              disabled={unlockM.isPending}
              onClick={() => unlockM.mutate(r.id)}
            >
              {t('goals.unlockMember')}
            </Button>
          )}
          {/* Le rappel a désormais son domicile ici : c'est le seul endroit qui connaît les noms. */}
          {!r.member.submitted && (
            <Button size="sm" variant="ghost" iconL={<Icon name="bell" size={13} />} onClick={() => openReminder(r.member)}>
              {t('goals.sendReminder')}
            </Button>
          )}
        </span>
      ),
    } as Column<MemberRow>,
  ];

  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ margin: '0 0 4px' }}>{t('goals.membersGoalsTitle')}</h4>
      {/* Compteur « 7/12 membres ont soumis » (RG-BQ-06) — `pct` absorbe le cas 0 membre. */}
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-500, #4A443B)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong><MembersSubmittedRatio u={data} /></strong>
        {data.lateMembers > 0 && (
          <Badge tone="err" dot>{t('goals.lateMembers', { count: data.lateMembers })}</Badge>
        )}
      </p>
      {lines.length > 0 && <Table columns={aggCols} rows={lines.map((l) => ({ ...l, id: l.categoryId }))} zebra />}
      <div style={{ marginTop: 12 }}>
        <Table
          columns={memberCols}
          rows={memberRows}
          zebra
          empty={
            <p style={{ color: 'var(--ink-400)', fontStyle: 'italic', margin: '6px 0 0' }}>
              {t('goals.noMemberInUnit')}
            </p>
          }
        />
      </div>

      <Modal
        open={reminderTarget != null}
        onClose={() => setReminderTarget(null)}
        title={t('goals.memberReminderTitle', { name: reminderTarget?.fullName ?? '' })}
        sub={t('goals.memberReminderSub')}
        footer={
          <>
            <Button onClick={() => setReminderTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={reminderM.isPending || reminderMsg.trim().length === 0}
              onClick={() => reminderM.mutate()}
              iconL={<Icon name="bell" size={14} />}
            >
              {reminderM.isPending ? t('goals.sending') : t('goals.send')}
            </Button>
          </>
        }
      >
        <Field label={t('goals.message')}>
          <textarea
            className="input"
            rows={4}
            maxLength={2000}
            value={reminderMsg}
            onChange={(e) => setReminderMsg(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>
      </Modal>
    </div>
  );
}

function DrillCountries({ continentId, onOpen }: { continentId: string; onOpen: (id: string, name: string) => void }) {
  const { t } = useTranslation();
  const countriesQ = useQuery({ queryKey: ['admin', 'countries'], queryFn: listCountries });
  const rows = (countriesQ.data ?? []).filter((c) => c.continentId === continentId);
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px' }}>{t('goals.pays')}</h4>
      <Table
        columns={[
          { label: t('goals.pays'), render: (c: (typeof rows)[number]) => <strong>{c.name}</strong> },
          { label: t('goals.code'), render: (c) => c.code },
          {
            label: '',
            style: { width: 40 },
            cellStyle: { textAlign: 'right' },
            render: () => <Icon name="chevRight" size={13} />,
          },
        ]}
        rows={rows}
        onRowClick={(c) => onOpen(c.id, c.name)}
        zebra
        empty={<p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>{t('goals.noCountryOnContinent')}</p>}
      />
    </div>
  );
}

function DrillZones({ countryId, onOpen }: { countryId: string; onOpen: (id: string, name: string) => void }) {
  const { t } = useTranslation();
  const zonesQ = useQuery({ queryKey: ['admin', 'zones', countryId], queryFn: () => listZones(countryId) });
  const rows = zonesQ.data ?? [];
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px' }}>{t('goals.zonesHeading')}</h4>
      <Table
        columns={[
          { label: t('common.zone'), render: (z: (typeof rows)[number]) => <strong>{z.name}</strong> },
          { label: t('goals.pays'), render: (z) => z.countryName },
          {
            label: '',
            style: { width: 40 },
            cellStyle: { textAlign: 'right' },
            render: () => <Icon name="chevRight" size={13} />,
          },
        ]}
        rows={rows}
        onRowClick={(z) => onOpen(z.id, z.name)}
        zebra
        empty={<p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>{t('goals.noZoneInCountry')}</p>}
      />
    </div>
  );
}

/** Villes d'une région, avec nombre d'assemblées + ratio de soumission (UC-SEC-02 bis). */
function DrillCities({ zoneId, year, onOpen }: { zoneId: string; year: number; onOpen: (id: string, name: string) => void }) {
  const { t } = useTranslation();
  const localitiesQ = useQuery({ queryKey: ['admin', 'localities', zoneId], queryFn: () => listLocalities({ zoneId }) });
  const unitsQ = useQuery({ queryKey: ['goals', 'zone-units', zoneId, year], queryFn: () => getZoneUnits(zoneId, year) });
  const units = unitsQ.data ?? [];
  // Maille PERSONNE (RG-BQ-06) : `assemblies` reste un décompte d'assemblées, le ratio de
  // soumission somme les MEMBRES des assemblées de la ville.
  const rows = (localitiesQ.data ?? []).map((l) => {
    const cityUnits = units.filter((u) => u.localityName === l.name);
    return {
      ...l,
      assemblies: cityUnits.length,
      total: cityUnits.reduce((n, u) => n + u.totalMembers, 0),
      submitted: cityUnits.reduce((n, u) => n + u.submittedMembers, 0),
      late: cityUnits.reduce((n, u) => n + u.lateMembers, 0),
    };
  });
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px' }}>{t('goals.citiesHeading')}</h4>
      <Table
        columns={[
          { label: t('common.locality'), render: (l: (typeof rows)[number]) => <strong>{l.name}</strong> },
          { label: t('goals.colAssemblies'), render: (l) => String(l.assemblies) },
          {
            label: t('goals.colMembersSubmitted'),
            render: (l) =>
              l.total > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Badge tone={l.submitted === l.total ? 'ok' : l.submitted > 0 ? 'warn' : 'gray'}>
                    {t('views.submittedRatio', {
                      submitted: l.submitted,
                      total: l.total,
                      percent: pct(l.submitted, l.total),
                    })}
                  </Badge>
                  {l.late > 0 && <Badge tone="err" dot>{t('goals.lateMembers', { count: l.late })}</Badge>}
                </span>
              ) : (
                <span style={{ color: 'var(--ink-400)' }}>—</span>
              ),
          },
          {
            label: '',
            style: { width: 40 },
            cellStyle: { textAlign: 'right' },
            render: () => <Icon name="chevRight" size={13} />,
          },
        ]}
        rows={rows}
        onRowClick={(l) => onOpen(l.id, l.name)}
        zebra
        empty={<p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>{t('goals.noCityInZone')}</p>}
      />
    </div>
  );
}

/**
 * Assemblées d'une ville dans le drill-down.
 *
 * <p>Plus de bouton « Déverrouiller » : l'endpoint d'unité n'existe plus (RG-BQ-06). La
 * réouverture est PAR PERSONNE, un cran plus bas — on ouvre l'assemblée pour l'atteindre.
 */
function DrillUnits({ zoneId, year, onOpen, cityName }: { zoneId: string; year: number; onOpen: (u: ZoneUnitStatus) => void; cityName?: string | null }) {
  const { t } = useTranslation();
  const unitsQ = useQuery({ queryKey: ['goals', 'zone-units', zoneId, year], queryFn: () => getZoneUnits(zoneId, year) });
  const rows = (unitsQ.data ?? []).filter((u) => cityName == null || u.localityName === cityName);

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px' }}>{t('goals.unitsStatusHeading')}</h4>
      <Table
        columns={[
          {
            label: t('common.unit'),
            render: (u: ZoneUnitStatus & { id: string }) => (
              <span>
                <strong>{u.unitName}</strong>
              </span>
            ),
          },
          { label: t('common.locality'), render: (u) => u.localityName ?? '—' },
          { label: t('goals.colMembersSubmitted'), render: (u) => <MembersSubmittedRatio u={u} /> },
          // Lot G1.b : dirigeant de l'unité dans le drill-down.
          { label: t('goals.colLeader'), render: (u) => u.leaderName ?? '—' },
          {
            label: t('goals.colStatus'),
            render: (u) => <UnitStatusBadges u={u} />,
          },
          {
            label: '',
            style: { width: 40 },
            cellStyle: { textAlign: 'right' },
            render: () => <Icon name="chevRight" size={13} />,
          },
        ]}
        rows={rows.map((u) => ({ ...u, id: u.unitId }))}
        onRowClick={(u) => onOpen(u)}
        zebra
        empty={
          <p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
            {cityName != null ? t('goals.noUnitInCity') : t('goals.noUnitInZone')}
          </p>
        }
      />
    </div>
  );
}
