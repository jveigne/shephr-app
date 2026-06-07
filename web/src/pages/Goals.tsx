import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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
  UnitTypeBadge,
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
  getTimeline,
  getUnitDetail,
  getZoneUnits,
  isProgressEditable,
  listFaithPledges,
  sendReminder,
  submitMyPledges,
  updateFaithPledge,
  updatePledge,
  updateProgress,
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

  const lines: GoalLine[] = useMemo(() => {
    if (!goal || !data) return [];
    const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
    return categories.map((category) => {
      const pledge = data.pledges.find((p) => p.categoryId === category.id) ?? null;
      const achieved = pledge
        ? (data.progressByPledge[pledge.id] ?? []).reduce(
            (s, x) => s + (x.amount ?? x.count ?? 0),
            0,
          )
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
        title: 'Engagements soumis',
        msg: `${res.lockedPledges} engagement(s) verrouillé(s).`,
      });
    },
    onError: (err) =>
      push({ kind: 'error', title: 'Soumission refusée', msg: errMsg(err, 'Impossible de soumettre, réessayez.') }),
  });

  const deleteProgressM = useMutation({
    mutationFn: (id: string) => deleteProgress(id),
    onSuccess: () => {
      invalidate();
      setToDeleteProgress(null);
      push({ kind: 'ok', title: 'Avancement supprimé' });
    },
    onError: (err) =>
      push({ kind: 'error', title: 'Suppression refusée', msg: errMsg(err, 'Suppression impossible.') }),
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
  // Lot 3.5 : un dirigeant (sous-coordinateur) voit « Mon périmètre » = son SOUS-ARBRE (pas la zone géo).
  const showPerimeter =
    !!me && !me.superAdmin && (me.goalRole === 'DIRIGEANT' || me.goalRole === 'DIRIGEANT_SENIOR');
  const noScope = !hasUnit && !hasPerimeter && !ministryWide && !showPerimeter;

  const zoneName = zonesQ.data?.find((z) => z.id === zoneId)?.name ?? null;
  const countryName = (id: string) => countriesQ.data?.find((c) => c.id === id)?.name ?? null;

  const lineCols: Column<GoalLine & { id: string }>[] = [
    {
      label: 'Catégorie',
      render: (l) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong>{l.category.name}</strong>
          <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
            {l.category.unitType === 'CURRENCY'
              ? `Montant (${currencySymbol(currency)})`
              : l.category.unitType === 'COUNT'
              ? `Nombre (${l.category.unitLabel ?? '—'})`
              : 'Liste nominative'}
          </span>
        </div>
      ),
    },
    {
      label: 'Engagé',
      render: (l) => (l.target != null ? <strong>{fmtTarget(l, l.target, currency)}</strong> : '—'),
    },
    {
      label: 'Versé',
      render: (l) => (l.pledge ? fmtTarget(l, l.achieved, currency) : '—'),
    },
    {
      label: 'Avancement',
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
      label: 'Statut',
      render: (l) =>
        l.pledge == null ? (
          <Badge tone="gray">À compléter</Badge>
        ) : l.pledge.locked ? (
          <Badge tone="ok" dot>Soumis</Badge>
        ) : (
          <Badge tone="warn" dot>Brouillon</Badge>
        ),
    },
    {
      label: '',
      style: { width: 70 },
      cellStyle: { textAlign: 'right' },
      render: (l) => (
        <IconButton
          icon={<Icon name={l.pledge?.locked ? 'eye' : 'edit'} size={15} />}
          title={l.pledge?.locked ? 'Consulter' : 'Modifier'}
          onClick={() => setEditLine(l)}
        />
      ),
    },
  ];

  const historyCols: Column<{ id: string; progress: ProgressResponse; line: GoalLine }>[] = [
    { label: 'Date', render: (r) => fmtDateLabel(r.progress.progressDate) },
    { label: 'Catégorie', render: (r) => r.line.category.name },
    {
      label: 'Valeur',
      render: (r) => (
        <strong>
          {r.progress.amount != null && r.line.category.unitType === 'CURRENCY'
            ? fmtAmount(r.progress.amount, currency)
            : `+${r.progress.count ?? r.progress.amount ?? 0} ${r.line.category.unitLabel ?? ''}`.trim()}
        </strong>
      ),
    },
    {
      label: 'Note',
      render: (r) =>
        r.progress.note ? <span style={{ fontStyle: 'italic' }}>{r.progress.note}</span> : '—',
    },
    {
      label: '',
      style: { width: 90 },
      cellStyle: { textAlign: 'right' },
      render: (r) =>
        isProgressEditable(r.progress, me?.id) ? (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <IconButton
              icon={<Icon name="edit" size={15} />}
              title="Modifier (moins de 24 h)"
              onClick={() => setEditProgress(r)}
            />
            <IconButton
              danger
              icon={<Icon name="trash" size={15} />}
              title="Supprimer (moins de 24 h)"
              onClick={() => setToDeleteProgress(r.progress)}
            />
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <TopBar
        title="Objectifs"
        crumbs={['shephr', 'Objectifs']}
        actions={
          <>
            {goal && (goal.openYears?.length ?? 0) > 0 && year != null && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-400)' }}>
                Année
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
                  {goal.openYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                      {y === 2026 || y === 2030 ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {hasPledges && (
              <>
                <Button iconL={<Icon name="plus" size={15} />} onClick={() => setProgressOpen(true)}>
                  Saisir un avancement
                </Button>
                {!submitted && (
                  <Button
                    variant="primary"
                    iconL={<Icon name="lock" size={15} />}
                    onClick={() => setSubmitOpen(true)}
                  >
                    Soumettre mes engagements
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <div className="content">
        {goalQ.isLoading || (hasUnit && unitQ.isLoading) ? (
          <p style={{ color: 'var(--ink-400)' }}>Chargement…</p>
        ) : noGoal ? (
          <EmptyNote
            title="Aucun objectif actif"
            text="Aucun objectif quinquennal n'est actif pour le moment. Contactez votre coordinateur."
          />
        ) : noScope ? (
          <EmptyNote
            title="Compte non rattaché"
            text="Votre compte n'est rattaché à aucun périmètre pour le module Objectifs (unité, zone ou pays). Contactez votre responsable."
          />
        ) : goalQ.isError || unitQ.isError ? (
          <EmptyNote title="Erreur" text={errMsg(error, 'Impossible de charger vos engagements.')} />
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 4px' }}>{goal?.name}</h3>
              <p style={{ margin: 0, color: 'var(--ink-400)', fontSize: 13 }}>
                {!hasUnit ? null : submitted ? (
                  <>
                    <Icon name="lock" size={12} /> Engagements soumis — montants verrouillés, les
                    avancements restent ouverts.
                  </>
                ) : goal?.submissionDeadline ? (
                  new Date(goal.submissionDeadline).getTime() < Date.now() ? (
                    <span style={{ color: 'var(--err, #B86A4A)' }}>
                      Échéance dépassée ({fmtDateLabel(goal.submissionDeadline.slice(0, 10))}) —
                      soumettez vos engagements dès que possible.
                    </span>
                  ) : (
                    <>À soumettre avant le {fmtDateLabel(goal.submissionDeadline.slice(0, 10))}.</>
                  )
                ) : null}
              </p>
            </div>

            {hasUnit && (
              <>
                <Table
                  columns={lineCols}
                  rows={lines.map((l) => ({ ...l, id: l.category.id }))}
                  zebra
                />

                <div style={{ marginTop: 28 }}>
                  <h3 style={{ margin: '0 0 10px' }}>Historique des avancements</h3>
                  <Table
                    columns={historyCols}
                    rows={historyEntries.map((e) => ({ ...e, id: e.progress.id }))}
                    zebra
                    empty={
                      <p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
                        Aucun avancement enregistré.
                      </p>
                    }
                  />
                </div>
              </>
            )}

            {goal && showPerimeter && year != null && (
              <MyPerimeterSection
                goal={goal}
                currency={currency}
                year={year}
                meId={me?.id ?? null}
                isSuperAdmin={me?.superAdmin ?? false}
                zoneId={zoneId}
                zoneName={zoneName}
              />
            )}
            {goal && year != null &&
              countryIds.map((id) => (
                <AggregateSection
                  key={id}
                  level="countries"
                  entityId={id}
                  year={year}
                  title={countryName(id) ? `Mon pays — ${countryName(id)}` : 'Mon pays'}
                  goal={goal}
                  currency={currency}
                  meId={me?.id ?? null}
                  isSuperAdmin={me?.superAdmin ?? false}
                />
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
                    title={countryName(id) ? `Pays coordonné — ${countryName(id)}` : 'Pays coordonné'}
                    goal={goal}
                    currency={currency}
                    meId={me?.id ?? null}
                    isSuperAdmin={me?.superAdmin ?? false}
                  />
                ))}

            {goal && ministryWide && year != null && <GlobalSummarySection goal={goal} currency={currency} year={year} />}
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
        title="Soumettre mes engagements"
        sub="Après soumission, les engagements sont verrouillés définitivement (acte unique). Seuls les avancements resteront modifiables."
        footer={
          <>
            <Button onClick={() => setSubmitOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={submitM.isPending}
              onClick={() => submitM.mutate()}
              iconL={<Icon name="lock" size={15} />}
            >
              {submitM.isPending ? 'Soumission…' : 'Confirmer et soumettre'}
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
        title="Confirmer la suppression"
        footer={
          <>
            <Button onClick={() => setToDeleteProgress(null)}>Annuler</Button>
            <Button
              variant="danger"
              disabled={deleteProgressM.isPending}
              onClick={() => toDeleteProgress && deleteProgressM.mutate(toDeleteProgress.id)}
            >
              Supprimer
            </Button>
          </>
        }
      >
        <p>Voulez-vous vraiment supprimer cet avancement ?</p>
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
      push({ kind: 'ok', title: 'Engagement enregistré' });
      onSaved();
    },
    onError: (err) =>
      push({
        kind: 'error',
        title: 'Enregistrement refusé',
        msg: (err as Error).message === 'invalid'
          ? 'Saisissez une valeur valide (0 autorisé).'
          : errMsg(err, 'Enregistrement impossible.'),
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
          ? 'Engagement soumis et verrouillé — lecture seule.'
          : "L'engagement reste modifiable jusqu'à la soumission."
      }
      footer={
        locked ? (
          <Button onClick={onClose}>Fermer</Button>
        ) : (
          <>
            <Button onClick={onClose}>Annuler</Button>
            <Button variant="primary" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
              {saveM.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        )
      }
    >
      <Field
        label={
          isCurrency
            ? `Montant engagé (${currencySymbol(currency)})`
            : `Engagement (${line.category.unitLabel ?? 'nombre'})`
        }
        hint={locked ? undefined : 'Saisir 0 signifie « pas d’engagement » sur cette catégorie.'}
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
      push({ kind: 'ok', title: 'Avancement enregistré' });
      onSaved();
    },
    onError: (err) =>
      push({
        kind: 'error',
        title: 'Enregistrement refusé',
        msg: (err as Error).message === 'invalid'
          ? 'Saisissez une valeur supérieure à 0.'
          : errMsg(err, 'Enregistrement impossible.'),
      }),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Saisir un avancement"
      sub="Enregistrez un versement ou une progression déjà réalisée. Modifiable pendant 24 h."
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={!selected || saveM.isPending}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Catégorie">
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
            Engagé : {selected.target != null ? fmtTarget(selected, selected.target, currency) : '—'} ·
            Versé : {fmtTarget(selected, selected.achieved, currency)} · Reste :{' '}
            {selected.target != null
              ? fmtTarget(selected, Math.max(0, selected.target - selected.achieved), currency)
              : '—'}
          </p>
        )}
        <Field
          label={
            isCurrency
              ? `Montant versé (${currencySymbol(currency)})`
              : `Progression (${selected?.category.unitLabel ?? 'nombre'})`
          }
        >
          <Input
            value={value}
            inputMode="decimal"
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
          />
        </Field>
        <Field label="Note (facultatif)">
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Modification d'un avancement de moins de 24 h (UC-DIR-14). */
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
      push({ kind: 'ok', title: 'Avancement modifié' });
      onSaved();
    },
    onError: (err) =>
      push({
        kind: 'error',
        title: 'Modification refusée',
        msg: (err as Error).message === 'invalid'
          ? 'Saisissez une valeur supérieure à 0.'
          : errMsg(err, 'Modification impossible (fenêtre de 24 h dépassée ?).'),
      }),
  });

  if (!entry) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Modifier l'avancement"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field
          label={
            isCurrency
              ? `Montant (${currencySymbol(currency)})`
              : `Valeur (${entry.line.category.unitLabel ?? 'nombre'})`
          }
        >
          <Input
            value={value}
            inputMode="decimal"
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
          />
        </Field>
        <Field label="Note (facultatif)">
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
  goal, currency, year, meId, isSuperAdmin, zoneId, zoneName,
}: {
  goal: ActiveGoal;
  currency: string;
  year: number;
  meId: string | null;
  isSuperAdmin: boolean;
  zoneId: string | null;
  zoneName: string | null;
}) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [faithCategory, setFaithCategory] = useState<GoalCategory | null>(null);
  const [faithToDelete, setFaithToDelete] = useState<FaithPledgeResponse | null>(null);

  const canFaith = zoneId != null;
  const aggQ = useQuery({ queryKey: ['goals', 'me-aggregate', year], queryFn: () => getMyPerimeterAggregate(year) });
  const faithQ = useQuery({
    queryKey: ['goals', 'faith', 'zones', zoneId, year],
    queryFn: () => listFaithPledges('zones', zoneId!, year),
    enabled: canFaith,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['goals', 'me-aggregate'] });
    if (zoneId) queryClient.invalidateQueries({ queryKey: ['goals', 'faith', 'zones', zoneId] });
  };

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFaithPledge(id),
    onSuccess: () => { refresh(); setFaithToDelete(null); push({ kind: 'ok', title: 'Engagement de foi retiré' }); },
    onError: (err) => push({ kind: 'error', title: 'Suppression refusée', msg: errMsg(err, 'Suppression impossible.') }),
  });

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const lineByCat = new Map((aggQ.data ?? []).map((l) => [l.categoryId, l]));
  const myFaiths = (faithQ.data ?? []).filter((f) => f.createdById === meId);
  const myFaithFor = (categoryId: string) => myFaiths.find((f) => f.categoryId === categoryId) ?? null;

  type AggRow = { id: string; category: GoalCategory };
  const aggCols: Column<AggRow>[] = [
    { label: 'Catégorie', render: (r) => <strong>{r.category.name}</strong> },
    {
      label: 'Mon sous-arbre',
      render: (r) => fmtCatValue(r.category, lineByCat.get(r.category.id)?.aggregateOfChildren ?? 0, currency),
    },
    ...(canFaith ? [{
      label: 'Mon engagement de foi',
      render: (r: AggRow) => {
        const mine = myFaithFor(r.category.id);
        return mine
          ? fmtCatValue(r.category, mine.targetAmount ?? mine.targetCount ?? 0, currency)
          : <span style={{ color: 'var(--ink-400)' }}>—</span>;
      },
    } as Column<AggRow>] : []),
    {
      label: 'Effectif retenu',
      render: (r) => {
        const line = lineByCat.get(r.category.id);
        const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <strong>{fmtCatValue(r.category, eff, currency)}</strong>
            {line && (
              <Badge tone={line.source === 'FAITH' ? 'earth' : 'gray'}>
                {line.source === 'FAITH' ? 'Foi' : 'Agrégat'}
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
          {myFaithFor(r.category.id) ? 'Modifier ma foi' : 'Déclarer ma foi'}
        </Button>
      ),
    } as Column<AggRow>] : []),
  ];

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: '0 0 4px' }}>Mon périmètre{zoneName ? ` — ${zoneName}` : ''}</h3>
      <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>
        Votre hiérarchie descendante (vos unités et celles de vos subordonnés).
        {canFaith && ' Effectif retenu = MAX(somme de votre sous-arbre, votre engagement de foi).'}
      </p>
      {aggQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>Chargement…</p>
      ) : aggQ.isError ? (
        <p style={{ color: 'var(--ink-400)' }}>{errMsg(aggQ.error, 'Périmètre inaccessible.')}</p>
      ) : (
        <Table columns={aggCols} rows={categories.map((c) => ({ id: c.id, category: c }))} zebra />
      )}

      {canFaith && myFaiths.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 8px' }}>Mes engagements de foi</h4>
          <Table
            columns={[
              {
                label: 'Catégorie',
                render: (f: FaithPledgeResponse) =>
                  goal.categories.find((c) => c.id === f.categoryId)?.name ?? f.categoryCode,
              },
              {
                label: 'Valeur',
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
                    <IconButton danger icon={<Icon name="trash" size={15} />} title="Retirer"
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
          level="zones"
          entityId={zoneId!}
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
        title="Retirer l'engagement de foi"
        footer={
          <>
            <Button onClick={() => setFaithToDelete(null)}>Annuler</Button>
            <Button variant="danger" disabled={deleteM.isPending}
              onClick={() => faithToDelete && deleteM.mutate(faithToDelete.id)}>
              Retirer
            </Button>
          </>
        }
      >
        <p>Voulez-vous vraiment retirer cet engagement de foi ? L'effectif retombera sur la somme de votre sous-arbre.</p>
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
      push({ kind: 'ok', title: 'Engagement de foi retiré' });
    },
    onError: (err) =>
      push({ kind: 'error', title: 'Suppression refusée', msg: errMsg(err, 'Suppression impossible.') }),
  });

  const categories = [...goal.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const lineByCat = new Map((aggQ.data ?? []).map((l) => [l.categoryId, l]));
  const faiths = faithQ.data ?? [];
  const myFaithFor = (categoryId: string) =>
    faiths.find((f) => f.categoryId === categoryId && f.createdById === meId) ?? null;

  type AggRow = { id: string; category: GoalCategory };
  const aggCols: Column<AggRow>[] = [
    { label: 'Catégorie', render: (r) => <strong>{r.category.name}</strong> },
    {
      label: 'Agrégat des sous-niveaux',
      render: (r) => {
        const line = lineByCat.get(r.category.id);
        return fmtCatValue(r.category, line?.aggregateOfChildren ?? 0, currency);
      },
    },
    {
      label: 'Mon engagement de foi',
      render: (r) => {
        const mine = myFaithFor(r.category.id);
        if (!mine) return <span style={{ color: 'var(--ink-400)' }}>—</span>;
        return fmtCatValue(r.category, mine.targetAmount ?? mine.targetCount ?? 0, currency);
      },
    },
    {
      label: 'Effectif retenu',
      render: (r) => {
        const line = lineByCat.get(r.category.id);
        const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <strong>{fmtCatValue(r.category, eff, currency)}</strong>
            {line && (
              <Badge tone={line.source === 'FAITH' ? 'earth' : 'gray'}>
                {line.source === 'FAITH' ? 'Foi' : 'Agrégat'}
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
          {myFaithFor(r.category.id) ? 'Modifier ma foi' : 'Déclarer ma foi'}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: '0 0 4px' }}>{title}</h3>
      <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>
        Engagement effectif = MAX(agrégat des sous-niveaux, engagement de foi) — un engagement de
        foi inférieur à l'agrégat n'est pas appliqué.
      </p>
      {aggQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>Chargement…</p>
      ) : aggQ.isError ? (
        <p style={{ color: 'var(--ink-400)' }}>{errMsg(aggQ.error, "Agrégat inaccessible (périmètre ?).")}</p>
      ) : (
        <Table columns={aggCols} rows={categories.map((c) => ({ id: c.id, category: c }))} zebra />
      )}

      {faiths.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 8px' }}>Engagements de foi déclarés</h4>
          <Table
            columns={[
              {
                label: 'Catégorie',
                render: (f: FaithPledgeResponse) =>
                  goal.categories.find((c) => c.id === f.categoryId)?.name ?? f.categoryCode,
              },
              {
                label: 'Valeur',
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
                label: 'Déclaré par',
                render: (f) => (
                  <span>
                    {f.createdByName ?? '—'}
                    {f.createdById === meId && <Badge tone="green"> moi</Badge>}
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
                      title="Retirer cet engagement de foi"
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
        title="Retirer l'engagement de foi"
        footer={
          <>
            <Button onClick={() => setFaithToDelete(null)}>Annuler</Button>
            <Button
              variant="danger"
              disabled={deleteM.isPending}
              onClick={() => faithToDelete && deleteM.mutate(faithToDelete.id)}
            >
              Retirer
            </Button>
          </>
        }
      >
        <p>
          Voulez-vous vraiment retirer cet engagement de foi ? L'effectif retombera sur l'agrégat
          des sous-niveaux.
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
      push({ kind: 'ok', title: 'Engagement de foi enregistré' });
      onSaved();
    },
    onError: (err) =>
      push({ kind: 'error', title: 'Enregistrement refusé', msg: errMsg(err, 'Enregistrement impossible.') }),
  });

  if (!category) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Engagement de foi — ${category.name}`}
      sub={`Agrégat actuel des sous-niveaux : ${fmtCatValue(category, aggregate, currency)}`}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? 'Enregistrement…' : existing ? 'Modifier' : 'Déclarer'}
          </Button>
        </>
      }
    >
      <Field
        label={
          isCurrency
            ? `Montant de foi (${currencySymbol(currency)})`
            : `Engagement de foi (${category.unitLabel ?? 'nombre'})`
        }
        hint={
          valid
            ? num > aggregate
              ? `Vous vous engagez par la foi à dépasser l'agrégat de ${fmtCatValue(category, num - aggregate, currency)}.`
              : "Votre engagement de foi est inférieur ou égal à l'agrégat — il ne sera pas appliqué (règle du MAX)."
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
  const { push } = useToast();
  const unitsQ = useQuery({
    queryKey: perimeterScoped ? ['goals', 'me-units', year] : ['goals', 'zone-units', zoneId, year],
    queryFn: () => (perimeterScoped ? getMyUnits(year) : getZoneUnits(zoneId!, year)),
  });
  const units = unitsQ.data ?? [];
  const allSubmitted = units.length > 0 && units.every((u) => u.submitted);

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
      ? ` avant le ${fmtDateLabel(goal.submissionDeadline.slice(0, 10))}`
      : '';
    setReminderMsg(
      `Bonjour, n'oubliez pas de soumettre les engagements de votre unité${deadline}. Que Dieu vous bénisse.`,
    );
    setReminderUnit(u);
  };

  const reminderM = useMutation({
    mutationFn: () => sendReminder(reminderUnit!.unitId, reminderMsg.trim() || undefined),
    onSuccess: (res) => {
      setReminderUnit(null);
      push({ kind: 'ok', title: 'Rappel envoyé', msg: res.sentToName ? `À ${res.sentToName}.` : undefined });
    },
    onError: (err) => {
      const raw = errMsg(err, '');
      const msg = /already sent|24 hours/i.test(raw)
        ? 'Un rappel a déjà été envoyé à cette unité il y a moins de 24 h.'
        : /no DIRIGEANT|NO_LEADER/i.test(raw)
        ? "Cette unité n'a pas de dirigeant rattaché au module Objectifs."
        : /already submitted/i.test(raw)
        ? 'Cette unité a déjà soumis ses engagements.'
        : raw || 'Envoi impossible.';
      push({ kind: 'error', title: 'Rappel non envoyé', msg });
    },
  });

  const statusBadge = (u: ZoneUnitStatus) => {
    if (u.submitted) return <Badge tone="ok" dot>Soumis</Badge>;
    if (u.late) return <Badge tone="err" dot>En retard</Badge>;
    if (u.pledgeCount > 0) return <Badge tone="warn" dot>Brouillon</Badge>;
    return <Badge tone="gray" dot>Non démarré</Badge>;
  };

  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: '0 0 8px' }}>Mes unités — statut de soumission</h4>
      {allSubmitted && (
        <p style={{ margin: '0 0 8px', color: 'var(--green-600, #2E5142)', fontSize: 13 }}>
          Toutes vos unités ont soumis !
        </p>
      )}
      {unitsQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>Chargement…</p>
      ) : (
        <Table
          columns={[
            {
              label: 'Unité',
              render: (u: ZoneUnitStatus & { id: string }) => (
                <span>
                  <button
                    type="button"
                    onClick={() => setDetailUnit(u)}
                    title="Voir le détail des engagements (lecture seule)"
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
                  {u.unitType && <UnitTypeBadge type={u.unitType} />}
                </span>
              ),
            },
            { label: 'Localité', render: (u) => u.localityName ?? '—' },
            {
              label: 'Engagements saisis',
              render: (u) => `${u.pledgeCount} / 5`,
            },
            {
              label: 'Statut',
              render: (u) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {statusBadge(u)}
                  {u.submittedAt && (
                    <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                      le {fmtDateLabel(u.submittedAt.slice(0, 10))}
                    </span>
                  )}
                </span>
              ),
            },
            {
              label: '',
              style: { width: 150 },
              cellStyle: { textAlign: 'right' },
              render: (u) =>
                u.submitted ? null : u.hasLeader ? (
                  <Button size="sm" iconL={<Icon name="bell" size={14} />} onClick={() => openReminder(u)}>
                    Envoyer un rappel
                  </Button>
                ) : (
                  <span
                    style={{ fontSize: 12, color: 'var(--ink-400)', fontStyle: 'italic' }}
                    title="Rattachez un DIRIGEANT à cette unité (module Objectifs) pour pouvoir la relancer."
                  >
                    Sans dirigeant
                  </span>
                ),
            },
          ]}
          rows={units.map((u) => ({ ...u, id: u.unitId }))}
          zebra
          empty={
            <p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>
              Aucune unité dans cette zone.
            </p>
          }
        />
      )}

      <Modal
        open={reminderUnit != null}
        onClose={() => setReminderUnit(null)}
        title={`Envoyer un rappel — ${reminderUnit?.unitName ?? ''}`}
        sub="Le rappel apparaîtra in-app pour le dirigeant de l'unité (pas d'email). Au plus un rappel par unité par 24 h."
        footer={
          <>
            <Button onClick={() => setReminderUnit(null)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={reminderM.isPending || reminderMsg.trim().length === 0}
              onClick={() => reminderM.mutate()}
              iconL={<Icon name="bell" size={14} />}
            >
              {reminderM.isPending ? 'Envoi…' : 'Envoyer'}
            </Button>
          </>
        }
      >
        <Field label="Message">
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
        title={`Engagements — ${detailUnit?.unitName ?? ''}`}
        sub={`Détail des engagements de l'unité pour ${year} (lecture seule).`}
        footer={<Button onClick={() => setDetailUnit(null)}>Fermer</Button>}
      >
        {detailQ.isLoading ? (
          <p style={{ color: 'var(--ink-400)' }}>Chargement…</p>
        ) : (
          <table style={{ width: '100%', fontSize: 14, borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-400)', fontSize: 12 }}>
                <th style={{ padding: '4px 8px' }}>Catégorie</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>Engagé</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>Versé</th>
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
        )}
      </Modal>
    </div>
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

function GlobalSummarySection({ goal, currency, year }: { goal: ActiveGoal; currency: string; year: number }) {
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
        <h3 style={{ margin: '0 0 4px' }}>Vue globale du ministère</h3>
        <DrillView goal={goal} currency={currency} year={year} path={path} setPath={setPath} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ margin: '0 0 4px' }}>Vue globale du ministère</h3>

      {/* Lot 7.1 — carte du monde + nations en retard (cliquer un pays = drill-down). */}
      {nationsQ.data && nationsQ.data.nations.length > 0 && (
        <div style={{ margin: '8px 0 20px' }}>
          <NationsMap
            nations={nationsQ.data.nations}
            deadlinePast={nationsQ.data.deadlinePast}
            onSelectCountry={(id, name) => setPath([{ level: 'countries', id, name }])}
          />
        </div>
      )}

      {summaryQ.isLoading ? (
        <p style={{ color: 'var(--ink-400)' }}>Chargement…</p>
      ) : summaryQ.isError ? (
        <p style={{ color: 'var(--ink-400)' }}>
          {errMsg(summaryQ.error, 'Résumé global inaccessible.')}
        </p>
      ) : summary ? (
        <>
          <p style={{ margin: '0 0 10px', color: 'var(--ink-400)', fontSize: 13 }}>
            {summary.submittedUnits} / {summary.totalUnits} unité(s) ont soumis
            {summary.totalUnits > 0
              ? ` (${Math.round((summary.submittedUnits / summary.totalUnits) * 100)} %)`
              : ''}
            .
          </p>
          <Table
            columns={[
              {
                label: 'Catégorie',
                render: (l: GlobalSummary['totals'][number] & { id: string }) => (
                  <strong>{catById.get(l.categoryId)?.name ?? l.categoryCode}</strong>
                ),
              },
              {
                label: 'Engagé (effectif)',
                render: (l) => fmtLine(l.categoryId, l.effectiveAmount ?? l.effectiveCount),
              },
              { label: 'Versé', render: (l) => fmtLine(l.categoryId, l.achieved) },
            ]}
            rows={summary.totals.map((l) => ({ ...l, id: l.categoryId }))}
            zebra
          />
          {summary.continents.map((continent) => (
            <div key={continent.continentId} style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
                {continent.name}{' '}
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--ink-400)' }}>
                  — {continent.submittedUnits} / {continent.totalUnits} unité(s) soumise(s)
                </span>
                <Button
                  size="sm"
                  iconR={<Icon name="arrowRight" size={13} />}
                  onClick={() =>
                    setPath([{ level: 'continents', id: continent.continentId, name: continent.name }])
                  }
                >
                  Explorer
                </Button>
              </h4>
              <Table
                columns={[
                  {
                    label: 'Catégorie',
                    render: (l: GlobalSummary['totals'][number] & { id: string }) =>
                      catById.get(l.categoryId)?.name ?? l.categoryCode,
                  },
                  {
                    label: 'Engagé (effectif)',
                    render: (l) => fmtLine(l.categoryId, l.effectiveAmount ?? l.effectiveCount),
                  },
                  { label: 'Versé', render: (l) => fmtLine(l.categoryId, l.achieved) },
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
          Vue globale
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
          {current.unitStatus.localityName ? `${current.unitStatus.localityName} · ` : ''}
          {current.unitStatus.pledgeCount}/5 engagements saisis ·{' '}
          {current.unitStatus.submitted ? (
            <Badge tone="ok" dot>Soumis</Badge>
          ) : current.unitStatus.late ? (
            <Badge tone="err" dot>En retard</Badge>
          ) : current.unitStatus.pledgeCount > 0 ? (
            <Badge tone="warn" dot>Brouillon</Badge>
          ) : (
            <Badge tone="gray" dot>Non démarré</Badge>
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

  if (aggQ.isLoading) return <p style={{ color: 'var(--ink-400)' }}>Chargement…</p>;
  if (aggQ.isError) {
    return <p style={{ color: 'var(--ink-400)' }}>{errMsg(aggQ.error, 'Agrégat inaccessible.')}</p>;
  }

  return (
    <>
      <Table
        columns={[
          {
            label: 'Catégorie',
            render: (r: { id: string; category: GoalCategory }) => <strong>{r.category.name}</strong>,
          },
          {
            label: level === 'units' ? 'Engagé (DIRECT)' : 'Agrégat des sous-niveaux',
            render: (r) =>
              fmtCatValue(r.category, lineByCat.get(r.category.id)?.aggregateOfChildren ?? 0, currency),
          },
          {
            label: 'Effectif retenu',
            render: (r) => {
              const line = lineByCat.get(r.category.id);
              const eff = line?.effectiveAmount ?? line?.effectiveCount ?? 0;
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <strong>{fmtCatValue(r.category, eff, currency)}</strong>
                  {line && level !== 'units' && (
                    <Badge tone={line.source === 'FAITH' ? 'earth' : 'gray'}>
                      {line.source === 'FAITH' ? 'Foi' : 'Agrégat'}
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
          Engagements de foi :{' '}
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
          <h4 style={{ margin: '0 0 8px' }}>Évolution du versé (cumulé par mois)</h4>
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
  const countriesQ = useQuery({ queryKey: ['admin', 'countries'], queryFn: listCountries });
  const rows = (countriesQ.data ?? []).filter((c) => c.continentId === continentId);
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px' }}>Pays</h4>
      <Table
        columns={[
          { label: 'Pays', render: (c: (typeof rows)[number]) => <strong>{c.name}</strong> },
          { label: 'Code', render: (c) => c.code },
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
        empty={<p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>Aucun pays sur ce continent.</p>}
      />
    </div>
  );
}

function DrillZones({ countryId, onOpen }: { countryId: string; onOpen: (id: string, name: string) => void }) {
  const zonesQ = useQuery({ queryKey: ['admin', 'zones', countryId], queryFn: () => listZones(countryId) });
  const rows = zonesQ.data ?? [];
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px' }}>Zones</h4>
      <Table
        columns={[
          { label: 'Zone', render: (z: (typeof rows)[number]) => <strong>{z.name}</strong> },
          { label: 'Pays', render: (z) => z.countryName },
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
        empty={<p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>Aucune zone dans ce pays.</p>}
      />
    </div>
  );
}

function DrillUnits({ zoneId, year, onOpen }: { zoneId: string; year: number; onOpen: (u: ZoneUnitStatus) => void }) {
  const unitsQ = useQuery({ queryKey: ['goals', 'zone-units', zoneId, year], queryFn: () => getZoneUnits(zoneId, year) });
  const rows = unitsQ.data ?? [];
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 8px' }}>Unités — statut de soumission</h4>
      <Table
        columns={[
          {
            label: 'Unité',
            render: (u: ZoneUnitStatus & { id: string }) => (
              <span>
                <strong>{u.unitName}</strong>
                {u.unitType && <UnitTypeBadge type={u.unitType} />}
              </span>
            ),
          },
          { label: 'Localité', render: (u) => u.localityName ?? '—' },
          { label: 'Engagements saisis', render: (u) => `${u.pledgeCount} / 5` },
          {
            label: 'Statut',
            render: (u) =>
              u.submitted ? (
                <Badge tone="ok" dot>Soumis</Badge>
              ) : u.late ? (
                <Badge tone="err" dot>En retard</Badge>
              ) : u.pledgeCount > 0 ? (
                <Badge tone="warn" dot>Brouillon</Badge>
              ) : (
                <Badge tone="gray" dot>Non démarré</Badge>
              ),
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
        empty={<p style={{ color: 'var(--ink-400)', fontStyle: 'italic' }}>Aucune unité dans cette zone.</p>}
      />
    </div>
  );
}
