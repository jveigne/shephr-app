import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  addProgress,
  createFaithPledge,
  createPledge,
  deleteFaithPledge,
  deleteProgress,
  getActiveGoal,
  getAggregate,
  getGlobalSummary,
  getMyPledges,
  getMyProgress,
  getMyPerimeterAggregate,
  getMyUnits,
  getNations,
  getRegionsSummary,
  getTimeline,
  getUnitDetail,
  getZoneUnits,
  listFaithPledges,
  sendReminder,
  unlockUnit,
  submitMyPledges,
  updateFaithPledge,
  updatePledge,
  updateProgress,
  updateYearDeadline,
  type ActiveGoal,
  type AggregateLevelPath,
  type FaithLevelPath,
  type FaithPledgeResponse,
  type GlobalSummary,
  type GoalCategory,
  type PledgeResponse,
  type ProgressResponse,
  type UnitPledgeDetail,
  type ZoneUnitStatus,
} from '../services/goalsApi';
import { listCountries, listZones } from '../services/adminApi';
import { NationsMap } from '../components/NationsMap';
import { GoalTimeline } from '../components/GoalTimeline';
import { currencySymbol, fmtAmount, fmtDateLabel, toLocalDate } from '../utils/format';

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** Données « mon unité » (UC-DIR-08) — chargées seulement si l'utilisateur a un goalUnitId. */
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
  // Lot 4.3 : un seul appel /me/progress remplace un listProgress par pledge.
  const [pledges, progress] = await Promise.all([getMyPledges(year), getMyProgress(year)]);
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
  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones(), enabled: zoneId != null });
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

  const submitM = useMutation({
    mutationFn: () => submitMyPledges(year ?? undefined),
    onSuccess: (res) => {
      invalidate();
      setSubmitOpen(false);
      push({
        kind: 'ok',
        title: t('goals.pledgesSubmittedToast'),
        msg: t('goals.lockedPledges', { count: res.lockedPledges }),
      });
    },
    onError: (err) =>
      push({ kind: 'error', title: t('goals.submitRefused'), msg: errMsg(err, t('goals.submitFailed')) }),
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
  const showPerimeter =
    !!me && !me.superAdmin && (me.goalRole === 'DIRIGEANT' || me.goalRole === 'DIRIGEANT_SENIOR');
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
              : l.category.unitType === 'COUNT'
              ? t('goals.countUnit', { label: l.category.unitLabel ?? '—' })
              : t('goals.nominativeList')}
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
      render: (l) => (
        <IconButton
          icon={<Icon name={l.pledge?.locked ? 'eye' : 'edit'} size={15} />}
          title={l.pledge?.locked ? t('goals.consult') : t('goals.editTooltip')}
          onClick={() => setEditLine(l)}
        />
      ),
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
            {goal && ((goal.visibleYears ?? goal.openYears)?.length ?? 0) > 0 && year != null && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-400)' }}>
                {t('goals.year')}
                <select
                  value={year}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--line, rgba(42,38,32,0.15))',
                    background: 'var(--parchment, #fff)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  {/* Lot G1.c : années visibles uniquement (JP 16/07 : le jalon final s'affiche « 2030 », sans libellé spécial). */}
                  {(goal.visibleYears ?? goal.openYears).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
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
                <ViewTitle label={t('views.unit')} />
                <Table
                  columns={lineCols}
                  rows={lines.map((l) => ({ ...l, id: l.category.id }))}
                  zebra
                />

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
                meId={me?.id ?? null}
                isSuperAdmin={me?.superAdmin ?? false}
                zoneId={zoneId}
                zoneName={zoneName}
                cityId={me?.goalCityId ?? null}
                cityName={me?.cityNames?.[0] ?? null}
                />
              </>
            )}

            {/* Lot V1 — vue Coordinateur : agrégats + foi Nation, puis cumuls PAR RÉGION (borné à la Région). */}
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
                  meId={me?.id ?? null}
                  isSuperAdmin={me?.superAdmin ?? false}
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
                    meId={me?.id ?? null}
                    isSuperAdmin={me?.superAdmin ?? false}
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

/** Saisie/édition d'un engagement CURRENCY ou COUNT (UC-DIR-09). 0 = pas d'engagement explicite. */
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
  const locked = line?.pledge?.locked ?? false;

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
      if (line!.pledge) return updatePledge(line!.pledge.id, payload);
      return createPledge({ categoryId: line!.category.id, year, ...payload });
    },
    onSuccess: () => {
      push({ kind: 'ok', title: t('goals.pledgeSaved') });
      onSaved();
    },
    onError: (err) =>
      push({
        kind: 'error',
        title: t('goals.saveRefused'),
        msg: (err as Error).message === 'invalid'
          ? t('goals.invalidValue')
          : errMsg(err, t('goals.saveFailed')),
      }),
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
 * Vue agrégée d'un niveau (zone/pays) — UC-LDR-04 / UC-COO-04.
 * Par catégorie : agrégat des enfants, engagements de foi, effectif = MAX (RG-08).
 */
/**
 * Lot 3.5 — « Mon périmètre » : vue d'un dirigeant sous-coordinateur scopée à son SOUS-ARBRE
 * (et non à la zone géographique). Deux dirigeants d'une même zone voient des agrégats DISTINCTS.
 * La foi (si une zone d'adressage est rattachée — cas DIRIGEANT_SENIOR) reste la SIENNE.
 */
function MyPerimeterSection({
  goal, currency, year, meId, isSuperAdmin, zoneId, zoneName, cityId, cityName,
}: {
  goal: ActiveGoal;
  currency: string;
  year: number;
  meId: string | null;
  isSuperAdmin: boolean;
  zoneId: string | null;
  zoneName: string | null;
  cityId: string | null;
  cityName: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [faithCategory, setFaithCategory] = useState<GoalCategory | null>(null);
  const [faithToDelete, setFaithToDelete] = useState<FaithPledgeResponse | null>(null);

  // Chantier B : la foi se déclare sur le NŒUD de rattachement — région (DIRIGEANT_SENIOR)
  // ou ville (DIRIGEANT de ville). La zone prime si les deux sont présents.
  const faithLevel: FaithLevelPath | null = zoneId != null ? 'zones' : cityId != null ? 'cities' : null;
  const faithEntityId = zoneId ?? cityId;
  const canFaith = faithLevel != null && faithEntityId != null;
  const aggQ = useQuery({ queryKey: ['goals', 'me-aggregate', year], queryFn: () => getMyPerimeterAggregate(year) });
  const faithQ = useQuery({
    queryKey: ['goals', 'faith', faithLevel, faithEntityId, year],
    queryFn: () => listFaithPledges(faithLevel!, faithEntityId!, year),
    enabled: canFaith,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['goals', 'me-aggregate'] });
    if (faithLevel) queryClient.invalidateQueries({ queryKey: ['goals', 'faith', faithLevel, faithEntityId] });
  };

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFaithPledge(id),
    onSuccess: () => { refresh(); setFaithToDelete(null); push({ kind: 'ok', title: t('goals.faithRemoved') }); },
    onError: (err) => push({ kind: 'error', title: t('goals.deleteRefused'), msg: errMsg(err, t('goals.deleteFailed')) }),
  });

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const lineByCat = new Map((aggQ.data ?? []).map((l) => [l.categoryId, l]));
  const myFaiths = (faithQ.data ?? []).filter((f) => f.createdById === meId);
  const myFaithFor = (categoryId: string) => myFaiths.find((f) => f.categoryId === categoryId) ?? null;

  type AggRow = { id: string; category: GoalCategory };
  const aggCols: Column<AggRow>[] = [
    { label: t('goals.colCategory'), render: (r) => <strong>{r.category.name}</strong> },
    {
      label: t('goals.colMySubtree'),
      render: (r) => fmtCatValue(r.category, lineByCat.get(r.category.id)?.aggregateOfChildren ?? 0, currency),
    },
    ...(canFaith ? [{
      label: t('goals.colMyFaith'),
      render: (r: AggRow) => {
        const mine = myFaithFor(r.category.id);
        return mine
          ? fmtCatValue(r.category, mine.targetAmount ?? mine.targetCount ?? 0, currency)
          : <span style={{ color: 'var(--ink-400)' }}>—</span>;
      },
    } as Column<AggRow>] : []),
    {
      label: t('goals.colEffective'),
      render: (r) => {
        const line = lineByCat.get(r.category.id);
        const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <strong>{fmtCatValue(r.category, eff, currency)}</strong>
            {line && (
              <Badge tone={line.source === 'FAITH' ? 'earth' : 'gray'}>
                {line.source === 'FAITH' ? t('goals.sourceFaith') : t('goals.sourceAggregate')}
              </Badge>
            )}
          </span>
        );
      },
    },
    ...(canFaith ? [{
      label: '',
      style: { width: 200 },
      cellStyle: { textAlign: 'right' },
      render: (r: AggRow) => (
        <Button size="sm" onClick={() => setFaithCategory(r.category)}>
          {myFaithFor(r.category.id) ? t('goals.editMyFaith') : t('goals.declareMyFaith')}
        </Button>
      ),
    } as Column<AggRow>] : []),
  ];

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: '0 0 4px' }}>{zoneName ? t('goals.myPerimeterNamed', { name: zoneName }) : cityName ? t('goals.myPerimeterNamed', { name: cityName }) : t('goals.myPerimeter')}</h3>
      <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>
        {t('goals.myPerimeterIntro')}
        {canFaith && t('goals.myPerimeterFaithRule')}
      </p>
      {aggQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
      ) : aggQ.isError ? (
        <p style={{ color: 'var(--ink-400)' }}>{errMsg(aggQ.error, t('goals.perimeterInaccessible'))}</p>
      ) : (
        <Table columns={aggCols} rows={categories.map((c) => ({ id: c.id, category: c }))} zebra />
      )}

      {canFaith && myFaiths.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 8px' }}>{t('goals.myFaithPledges')}</h4>
          <Table
            columns={[
              {
                label: t('goals.colCategory'),
                render: (f: FaithPledgeResponse) =>
                  goal.categories.find((c) => c.id === f.categoryId)?.name ?? f.categoryCode,
              },
              {
                label: t('goals.colValue'),
                render: (f) => {
                  const cat = goal.categories.find((c) => c.id === f.categoryId);
                  return cat
                    ? <strong>{fmtCatValue(cat, f.targetAmount ?? f.targetCount ?? 0, currency)}</strong>
                    : (f.targetAmount ?? f.targetCount ?? 0);
                },
              },
              {
                label: '',
                style: { width: 60 },
                cellStyle: { textAlign: 'right' },
                render: (f) =>
                  f.createdById === meId || isSuperAdmin ? (
                    <IconButton danger icon={<Icon name="trash" size={15} />} title={t('goals.remove')}
                      onClick={() => setFaithToDelete(f)} />
                  ) : null,
              },
            ]}
            rows={myFaiths}
          />
        </div>
      )}

      <ZoneUnitsBlock zoneId={zoneId} goal={goal} year={year} perimeterScoped />

      {canFaith && (
        <FaithFormModal
          level={faithLevel!}
          entityId={faithEntityId!}
          category={faithCategory}
          year={year}
          aggregate={faithCategory ? lineByCat.get(faithCategory.id)?.aggregateOfChildren ?? 0 : 0}
          existing={faithCategory ? myFaithFor(faithCategory.id) : null}
          currency={currency}
          onClose={() => setFaithCategory(null)}
          onSaved={() => { refresh(); setFaithCategory(null); }}
        />
      )}

      <Modal
        open={faithToDelete != null}
        onClose={() => setFaithToDelete(null)}
        title={t('goals.removeFaithTitle')}
        footer={
          <>
            <Button onClick={() => setFaithToDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" disabled={deleteM.isPending}
              onClick={() => faithToDelete && deleteM.mutate(faithToDelete.id)}>
              {t('goals.remove')}
            </Button>
          </>
        }
      >
        <p>{t('goals.removeFaithSubtree')}</p>
      </Modal>
    </div>
  );
}

function AggregateSection({
  level,
  entityId,
  title,
  goal,
  currency,
  year,
  meId,
  isSuperAdmin,
}: {
  level: FaithLevelPath;
  entityId: string;
  title: string;
  goal: ActiveGoal;
  currency: string;
  year: number;
  meId: string | null;
  isSuperAdmin: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [faithCategory, setFaithCategory] = useState<GoalCategory | null>(null);
  const [faithToDelete, setFaithToDelete] = useState<FaithPledgeResponse | null>(null);

  const aggQ = useQuery({
    queryKey: ['goals', 'aggregate', level, entityId, year],
    queryFn: () => getAggregate(level, entityId, year),
  });
  const faithQ = useQuery({
    queryKey: ['goals', 'faith', level, entityId, year],
    queryFn: () => listFaithPledges(level, entityId, year),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['goals', 'aggregate', level, entityId] });
    queryClient.invalidateQueries({ queryKey: ['goals', 'faith', level, entityId] });
  };

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFaithPledge(id),
    onSuccess: () => {
      refresh();
      setFaithToDelete(null);
      push({ kind: 'ok', title: t('goals.faithRemoved') });
    },
    onError: (err) =>
      push({ kind: 'error', title: t('goals.deleteRefused'), msg: errMsg(err, t('goals.deleteFailed')) }),
  });

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const lineByCat = new Map((aggQ.data ?? []).map((l) => [l.categoryId, l]));
  const faiths = faithQ.data ?? [];
  const myFaithFor = (categoryId: string) =>
    faiths.find((f) => f.categoryId === categoryId && f.createdById === meId) ?? null;

  type AggRow = { id: string; category: GoalCategory };
  const aggCols: Column<AggRow>[] = [
    { label: t('goals.colCategory'), render: (r) => <strong>{r.category.name}</strong> },
    {
      label: t('goals.colAggregate'),
      render: (r) => {
        const line = lineByCat.get(r.category.id);
        return fmtCatValue(r.category, line?.aggregateOfChildren ?? 0, currency);
      },
    },
    {
      label: t('goals.colMyFaith'),
      render: (r) => {
        const mine = myFaithFor(r.category.id);
        if (!mine) return <span style={{ color: 'var(--ink-400)' }}>—</span>;
        return fmtCatValue(r.category, mine.targetAmount ?? mine.targetCount ?? 0, currency);
      },
    },
    {
      label: t('goals.colEffective'),
      render: (r) => {
        const line = lineByCat.get(r.category.id);
        const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <strong>{fmtCatValue(r.category, eff, currency)}</strong>
            {line && (
              <Badge tone={line.source === 'FAITH' ? 'earth' : 'gray'}>
                {line.source === 'FAITH' ? t('goals.sourceFaith') : t('goals.sourceAggregate')}
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      label: '',
      style: { width: 200 },
      cellStyle: { textAlign: 'right' },
      render: (r) => (
        <Button size="sm" onClick={() => setFaithCategory(r.category)}>
          {myFaithFor(r.category.id) ? t('goals.editMyFaith') : t('goals.declareMyFaith')}
        </Button>
      ),
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

      {faiths.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 8px' }}>{t('goals.faithDeclared')}</h4>
          <Table
            columns={[
              {
                label: t('goals.colCategory'),
                render: (f: FaithPledgeResponse) =>
                  goal.categories.find((c) => c.id === f.categoryId)?.name ?? f.categoryCode,
              },
              {
                label: t('goals.colValue'),
                render: (f) => {
                  const cat = goal.categories.find((c) => c.id === f.categoryId);
                  return cat ? (
                    <strong>{fmtCatValue(cat, f.targetAmount ?? f.targetCount ?? 0, currency)}</strong>
                  ) : (
                    f.targetAmount ?? f.targetCount ?? 0
                  );
                },
              },
              {
                label: t('goals.colDeclaredBy'),
                render: (f) => (
                  <span>
                    {f.createdByName ?? '—'}
                    {f.createdById === meId && <Badge tone="green">{t('goals.me')}</Badge>}
                  </span>
                ),
              },
              {
                label: '',
                style: { width: 60 },
                cellStyle: { textAlign: 'right' },
                render: (f) =>
                  f.createdById === meId || isSuperAdmin ? (
                    <IconButton
                      danger
                      icon={<Icon name="trash" size={15} />}
                      title={t('goals.removeFaithTooltip')}
                      onClick={() => setFaithToDelete(f)}
                    />
                  ) : null,
              },
            ]}
            rows={faiths}
          />
        </div>
      )}

      {level === 'zones' && <ZoneUnitsBlock zoneId={entityId} goal={goal} year={year} />}

      <FaithFormModal
        level={level}
        entityId={entityId}
        category={faithCategory}
        year={year}
        aggregate={
          faithCategory ? lineByCat.get(faithCategory.id)?.aggregateOfChildren ?? 0 : 0
        }
        existing={faithCategory ? myFaithFor(faithCategory.id) : null}
        currency={currency}
        onClose={() => setFaithCategory(null)}
        onSaved={() => {
          refresh();
          setFaithCategory(null);
        }}
      />

      <Modal
        open={faithToDelete != null}
        onClose={() => setFaithToDelete(null)}
        title={t('goals.removeFaithTitle')}
        footer={
          <>
            <Button onClick={() => setFaithToDelete(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={deleteM.isPending}
              onClick={() => faithToDelete && deleteM.mutate(faithToDelete.id)}
            >
              {t('goals.remove')}
            </Button>
          </>
        }
      >
        <p>
          {t('goals.removeFaithAggregate')}
        </p>
      </Modal>
    </div>
  );
}

/** Déclaration / modification d'un engagement de foi (UC-LDR-05, UC-COO-05). */
function FaithFormModal({
  level,
  entityId,
  category,
  year,
  aggregate,
  existing,
  currency,
  onClose,
  onSaved,
}: {
  level: FaithLevelPath;
  entityId: string;
  category: GoalCategory | null;
  year: number;
  aggregate: number;
  existing: FaithPledgeResponse | null;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [value, setValue] = useState('');
  const isCurrency = category?.unitType === 'CURRENCY';

  useEffect(() => {
    if (category) {
      const v = existing ? existing.targetAmount ?? existing.targetCount : null;
      setValue(v != null ? String(v) : '');
    }
  }, [category, existing]);

  const num = Number.parseFloat(value.replace(',', '.'));
  const valid = Number.isFinite(num) && num > 0;

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = isCurrency ? { targetAmount: num } : { targetCount: Math.round(num) };
      if (existing) return updateFaithPledge(existing.id, payload);
      return createFaithPledge(level, entityId, { categoryId: category!.id, year, ...payload });
    },
    onSuccess: () => {
      push({ kind: 'ok', title: t('goals.faithSaved') });
      onSaved();
    },
    onError: (err) =>
      push({ kind: 'error', title: t('goals.saveRefused'), msg: errMsg(err, t('goals.saveFailed')) }),
  });

  if (!category) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={t('goals.faithModalTitle', { category: category.name })}
      sub={t('goals.faithModalSub', { aggregate: fmtCatValue(category, aggregate, currency) })}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? t('common.saving') : existing ? t('common.edit') : t('goals.declare')}
          </Button>
        </>
      }
    >
      <Field
        label={
          isCurrency
            ? t('goals.faithAmount', { symbol: currencySymbol(currency) })
            : t('goals.faithCount', { label: category.unitLabel ?? t('goals.labelNumber') })
        }
        hint={
          valid
            ? num > aggregate
              ? t('goals.faithAbove', { value: fmtCatValue(category, num - aggregate, currency) })
              : t('goals.faithBelowOrEqual')
            : undefined
        }
      >
        <Input
          value={value}
          inputMode="decimal"
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
        />
      </Field>
    </Modal>
  );
}

/** Statut de soumission des unités de la zone (UC-LDR-06) + rappels (UC-LDR-07, Lot 4.4). */
function ZoneUnitsBlock({
  zoneId, goal, year, perimeterScoped = false,
}: { zoneId: string | null; goal: ActiveGoal; year: number; perimeterScoped?: boolean }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const { me } = useAuth();
  // Lot P2 (décision JP 17/07) : déverrouillage réservé à SUPER_ADMIN + SECRETARIAT (pas LEADER).
  const canUnlock = (me?.superAdmin ?? false) || me?.goalRole === 'SECRETARIAT';
  const unitsQ = useQuery({
    queryKey: perimeterScoped ? ['goals', 'me-units', year] : ['goals', 'zone-units', zoneId, year],
    queryFn: () => (perimeterScoped ? getMyUnits(year) : getZoneUnits(zoneId!, year)),
  });
  const units = unitsQ.data ?? [];
  const allSubmitted = units.length > 0 && units.every((u) => u.submitted);

  // Lot P2 : rouvrir la soumission d'une assemblée (elle pourra compléter puis resoumettre).
  const [unlockUnitTarget, setUnlockUnitTarget] = useState<ZoneUnitStatus | null>(null);
  const unlockM = useMutation({
    mutationFn: () => unlockUnit(unlockUnitTarget!.unitId, year),
    onSuccess: () => {
      setUnlockUnitTarget(null);
      unitsQ.refetch();
      push({ kind: 'ok', title: t('goals.unitUnlocked') });
    },
    onError: (err) => {
      push({ kind: 'error', title: t('goals.unlockFailed'), msg: errMsg(err, '') || undefined });
    },
  });

  // UC-LDR-07 : modale de rappel avec message pré-rempli (modifiable).
  const [reminderUnit, setReminderUnit] = useState<ZoneUnitStatus | null>(null);
  const [reminderMsg, setReminderMsg] = useState('');

  // Lot 4.7 : détail (lecture seule) des engagements d'une unité du sous-arbre.
  const [detailUnit, setDetailUnit] = useState<ZoneUnitStatus | null>(null);
  const detailQ = useQuery({
    queryKey: ['goals', 'unit-detail', detailUnit?.unitId, year],
    queryFn: () => getUnitDetail(detailUnit!.unitId, year),
    enabled: detailUnit != null,
  });
  const catByCode = new Map(goal.categories.map((c) => [c.code, c]));

  const openReminder = (u: ZoneUnitStatus) => {
    const deadline = goal.submissionDeadline
      ? t('goals.reminderDeadline', { date: fmtDateLabel(goal.submissionDeadline.slice(0, 10)) })
      : '';
    setReminderMsg(
      t('goals.reminderDefaultMessage', { deadline }),
    );
    setReminderUnit(u);
  };

  const reminderM = useMutation({
    mutationFn: () => sendReminder(reminderUnit!.unitId, reminderMsg.trim() || undefined),
    onSuccess: (res) => {
      setReminderUnit(null);
      push({ kind: 'ok', title: t('goals.reminderSent'), msg: res.sentToName ? t('goals.reminderSentTo', { name: res.sentToName }) : undefined });
    },
    onError: (err) => {
      const raw = errMsg(err, '');
      const msg = /already sent|24 hours/i.test(raw)
        ? t('goals.reminderAlreadySent')
        : /no DIRIGEANT|NO_LEADER/i.test(raw)
        ? t('goals.reminderNoLeader')
        : /already submitted/i.test(raw)
        ? t('goals.reminderAlreadySubmitted')
        : raw || t('goals.reminderSendFailed');
      push({ kind: 'error', title: t('goals.reminderNotSent'), msg });
    },
  });

  const statusBadge = (u: ZoneUnitStatus) => {
    if (u.submitted) return <Badge tone="ok" dot>{t('goals.submitted')}</Badge>;
    if (u.late) return <Badge tone="err" dot>{t('goals.late')}</Badge>;
    if (u.pledgeCount > 0) return <Badge tone="warn" dot>{t('goals.draft')}</Badge>;
    return <Badge tone="gray" dot>{t('goals.statusNotStarted')}</Badge>;
  };

  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: '0 0 8px' }}>{t('goals.myUnitsStatus')}</h4>
      {allSubmitted && (
        <p style={{ margin: '0 0 8px', color: 'var(--green-600, #2E5142)', fontSize: 13 }}>
          {t('goals.allUnitsSubmitted')}
        </p>
      )}
      {unitsQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
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
              label: t('goals.colPledgesEntered'),
              render: (u) => t('goals.pledgesCount5', { count: u.pledgeCount }),
            },
            {
              // Lot G1.b : dirigeant de l'unité, à côté du statut.
              label: t('goals.colLeader'),
              render: (u) => u.leaderName ?? '—',
            },
            {
              label: t('goals.colStatus'),
              render: (u) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {statusBadge(u)}
                  {u.submittedAt && (
                    <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                      {t('goals.submittedOn', { date: fmtDateLabel(u.submittedAt.slice(0, 10)) })}
                    </span>
                  )}
                </span>
              ),
            },
            {
              label: '',
              style: { width: 160 },
              cellStyle: { textAlign: 'right' },
              render: (u) =>
                u.submitted ? (
                  // Lot P2 : le secrétariat (ou super admin) rouvre une soumission.
                  canUnlock ? (
                    <Button
                      size="sm"
                      title={t('goals.unlockTooltip')}
                      onClick={() => setUnlockUnitTarget(u)}
                    >
                      {t('goals.unlockUnit')}
                    </Button>
                  ) : null
                ) : u.hasLeader ? (
                  <Button size="sm" iconL={<Icon name="bell" size={14} />} onClick={() => openReminder(u)}>
                    {t('goals.sendReminder')}
                  </Button>
                ) : (
                  <span
                    style={{ fontSize: 12, color: 'var(--ink-400)', fontStyle: 'italic' }}
                    title={t('goals.attachLeaderTooltip')}
                  >
                    {t('goals.noLeader')}
                  </span>
                ),
            },
          ]}
          rows={units.map((u) => ({ ...u, id: u.unitId }))}
          zebra
          empty={
            <p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
              {t('goals.noUnitInZone')}
            </p>
          }
        />
      )}

      <Modal
        open={reminderUnit != null}
        onClose={() => setReminderUnit(null)}
        title={t('goals.reminderModalTitle', { name: reminderUnit?.unitName ?? '' })}
        sub={t('goals.reminderModalSub')}
        footer={
          <>
            <Button onClick={() => setReminderUnit(null)}>{t('common.cancel')}</Button>
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

      <Modal
        open={detailUnit != null}
        onClose={() => setDetailUnit(null)}
        title={t('goals.unitPledgesTitle', { name: detailUnit?.unitName ?? '' })}
        sub={t('goals.unitPledgesSub', { year })}
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
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('goals.colPledged')}</th>
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
                      {d.locked && <Icon name="lock" size={11} />}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{engaged}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--ink-400)' }}>{achieved}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </Modal>

      <Modal
        open={unlockUnitTarget != null}
        onClose={() => setUnlockUnitTarget(null)}
        title={t('goals.unlockModalTitle', { name: unlockUnitTarget?.unitName ?? '' })}
        sub={t('goals.unlockModalSub', { year })}
        footer={
          <>
            <Button onClick={() => setUnlockUnitTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={unlockM.isPending} onClick={() => unlockM.mutate()}>
              {unlockM.isPending ? t('common.saving') : t('goals.unlockConfirm')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{t('goals.unlockModalBody')}</p>
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
            <Badge tone={r.submissionRate >= 1 ? 'ok' : r.submittedUnits > 0 ? 'warn' : 'gray'}>
              {t('views.submittedRatio', { submitted: r.submittedUnits, total: r.totalUnits, percent: Math.round(r.submissionRate * 100) })}
            </Badge>
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
  level: 'continents' | 'countries' | 'zones' | 'units';
  id: string;
  name: string;
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
          <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>
            {t('goals.unitsSubmittedRatio', {
              submitted: summary.submittedUnits,
              total: summary.totalUnits,
              percent:
                summary.totalUnits > 0
                  ? t('goals.percent', { value: Math.round((summary.submittedUnits / summary.totalUnits) * 100) })
                  : '',
            })}
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
                  {t('goals.continentSubmitted', { submitted: continent.submittedUnits, total: continent.totalUnits })}
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
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-400)' }}>
          {current.unitStatus.localityName ? t('goals.localityPrefix', { name: current.unitStatus.localityName }) : ''}
          {t('goals.pledgesEnteredInline', { count: current.unitStatus.pledgeCount })}
          {current.unitStatus.submitted ? (
            <Badge tone="ok" dot>{t('goals.submitted')}</Badge>
          ) : current.unitStatus.late ? (
            <Badge tone="err" dot>{t('goals.late')}</Badge>
          ) : current.unitStatus.pledgeCount > 0 ? (
            <Badge tone="warn" dot>{t('goals.draft')}</Badge>
          ) : (
            <Badge tone="gray" dot>{t('goals.statusNotStarted')}</Badge>
          )}
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
        <DrillUnits
          zoneId={current.id}
          year={year}
          onOpen={(u) => setPath([...path, { level: 'units', id: u.unitId, name: u.unitName, unitStatus: u }])}
        />
      )}
    </>
  );
}

/** Agrégats par catégorie d'un niveau + fois déclarées (lecture seule). */
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
  const faithQ = useQuery({
    queryKey: ['goals', 'faith', level, entityId, year],
    queryFn: () => listFaithPledges(level as FaithLevelPath, entityId, year),
    enabled: level !== 'units', // pas d'engagement de foi au niveau unité
  });
  // Lot 7.1 — évolution dans le temps (versé cumulé par mois) à CE niveau.
  const timelineQ = useQuery({
    queryKey: ['goals', 'timeline', level, entityId, year],
    queryFn: () => getTimeline(level, entityId, year),
  });

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const lineByCat = new Map((aggQ.data ?? []).map((l) => [l.categoryId, l]));
  const faiths = faithQ.data ?? [];

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
            label: level === 'units' ? t('goals.colDirectPledged') : t('goals.colAggregate'),
            render: (r) =>
              fmtCatValue(r.category, lineByCat.get(r.category.id)?.aggregateOfChildren ?? 0, currency),
          },
          {
            label: t('goals.colEffective'),
            render: (r) => {
              const line = lineByCat.get(r.category.id);
              const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <strong>{fmtCatValue(r.category, eff, currency)}</strong>
                  {line && level !== 'units' && (
                    <Badge tone={line.source === 'FAITH' ? 'earth' : 'gray'}>
                      {line.source === 'FAITH' ? t('goals.sourceFaith') : t('goals.sourceAggregate')}
                    </Badge>
                  )}
                </span>
              );
            },
          },
        ]}
        rows={categories.map((c) => ({ id: c.id, category: c }))}
        zebra
      />
      {faiths.length > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-600)' }}>
          {t('goals.faithPledgesInline')}
          {faiths
            .map((f) => {
              const cat = goal.categories.find((c) => c.id === f.categoryId);
              const value = cat ? fmtCatValue(cat, f.targetAmount ?? f.targetCount ?? 0, currency) : '';
              return `${cat?.name ?? f.categoryCode} ${value} (${f.createdByName ?? '—'})`;
            })
            .join(' · ')}
        </p>
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

function DrillUnits({ zoneId, year, onOpen }: { zoneId: string; year: number; onOpen: (u: ZoneUnitStatus) => void }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const { me } = useAuth();
  // Lot P2 (décision #14) : déverrouillage réservé à SUPER_ADMIN + SECRETARIAT.
  const canUnlock = (me?.superAdmin ?? false) || me?.goalRole === 'SECRETARIAT';
  const unitsQ = useQuery({ queryKey: ['goals', 'zone-units', zoneId, year], queryFn: () => getZoneUnits(zoneId, year) });
  const rows = unitsQ.data ?? [];

  const [unlockTarget, setUnlockTarget] = useState<ZoneUnitStatus | null>(null);
  const unlockM = useMutation({
    mutationFn: () => unlockUnit(unlockTarget!.unitId, year),
    onSuccess: () => {
      setUnlockTarget(null);
      unitsQ.refetch();
      push({ kind: 'ok', title: t('goals.unitUnlocked') });
    },
    onError: (err) => {
      push({ kind: 'error', title: t('goals.unlockFailed'), msg: errMsg(err, '') || undefined });
    },
  });

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
          { label: t('goals.colPledgesEntered'), render: (u) => t('goals.pledgesCount5', { count: u.pledgeCount }) },
          // Lot G1.b : dirigeant de l'unité dans le drill-down.
          { label: t('goals.colLeader'), render: (u) => u.leaderName ?? '—' },
          {
            label: t('goals.colStatus'),
            render: (u) =>
              u.submitted ? (
                <Badge tone="ok" dot>{t('goals.submitted')}</Badge>
              ) : u.late ? (
                <Badge tone="err" dot>{t('goals.late')}</Badge>
              ) : u.pledgeCount > 0 ? (
                <Badge tone="warn" dot>{t('goals.draft')}</Badge>
              ) : (
                <Badge tone="gray" dot>{t('goals.statusNotStarted')}</Badge>
              ),
          },
          {
            label: '',
            style: { width: canUnlock ? 160 : 40 },
            cellStyle: { textAlign: 'right' },
            render: (u) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {/* Lot P2 : rouvrir une soumission depuis le drill-down secrétariat. */}
                {canUnlock && u.submitted && (
                  <Button
                    size="sm"
                    title={t('goals.unlockTooltip')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setUnlockTarget(u);
                    }}
                  >
                    {t('goals.unlockUnit')}
                  </Button>
                )}
                <Icon name="chevRight" size={13} />
              </span>
            ),
          },
        ]}
        rows={rows.map((u) => ({ ...u, id: u.unitId }))}
        onRowClick={(u) => onOpen(u)}
        zebra
        empty={<p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>{t('goals.noUnitInZone')}</p>}
      />

      <Modal
        open={unlockTarget != null}
        onClose={() => setUnlockTarget(null)}
        title={t('goals.unlockModalTitle', { name: unlockTarget?.unitName ?? '' })}
        sub={t('goals.unlockModalSub', { year })}
        footer={
          <>
            <Button onClick={() => setUnlockTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={unlockM.isPending} onClick={() => unlockM.mutate()}>
              {unlockM.isPending ? t('common.saving') : t('goals.unlockConfirm')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{t('goals.unlockModalBody')}</p>
      </Modal>
    </div>
  );
}
