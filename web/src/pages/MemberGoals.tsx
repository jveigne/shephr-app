import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Badge, Button, Field, Input, Modal, Picker, Table, TopBar, type Column } from '../components/ui';
import { useToast } from '../components/Toast';
import { YearPicker } from '../components/YearPicker';
import { useAuth } from '../hooks/useAuth';
import {
  addProgress,
  fetchMyMemberPledges,
  getActiveGoal,
  getMyMemberProgress,
  saveMemberPledge,
  submitMyMemberPledges,
  type GoalCategory,
  type MyProgressResponse,
  type PledgeResponse,
} from '../services/goalsApi';
import { currencySymbol, fmtAmount, fmtDateLabel } from '../utils/format';

// Feature A — « Mes objectifs » : le MEMBRE déclare son objectif personnel par catégorie.
// Ces objectifs alimentent l'agrégat des fidèles de son assemblée (members-aggregate).

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;

/** Valeur d'une ligne selon le type de catégorie (montant ou nombre + libellé d'unité). */
const fmtLineValue = (line: MemberLine, value: number, currency: string) =>
  line.category.unitType === 'CURRENCY'
    ? fmtAmount(value, currency)
    : `${value} ${line.category.unitLabel ?? ''}`.trim();

interface MemberLine {
  id: string;
  category: GoalCategory;
  pledge: PledgeResponse | null;
  /** Dernier état déclaré (déclaration d'ÉTAT : elle remplace la précédente, elle ne s'ajoute pas). */
  achieved: number | null;
}

export function MemberGoalsPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { push } = useToast();
  const queryClient = useQueryClient();

  const goalQ = useQuery({ queryKey: ['goals', 'active'], queryFn: getActiveGoal, retry: false });
  const goal = goalQ.data ?? null;

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? goal?.currentYear ?? null;

  const pledgesQ = useQuery({
    queryKey: ['goals', 'member-pledges', year],
    queryFn: () => fetchMyMemberPledges(year!),
    enabled: !!me?.goalUnitId && year != null,
    retry: false,
  });

  // Avancements : déclarations d'ÉTAT sur MES objectifs (décision JP 28/07).
  const progressQ = useQuery({
    queryKey: ['goals', 'member-progress', year],
    queryFn: () => getMyMemberProgress(year!),
    enabled: !!me?.goalUnitId && year != null,
    retry: false,
  });

  /** Dernier état déclaré par engagement : le plus récent REMPLACE les précédents, il ne s'y ajoute pas. */
  const latestByPledge = new Map<string, MyProgressResponse>();
  for (const p of progressQ.data ?? []) {
    const kept = latestByPledge.get(p.pledgeId);
    const newer =
      kept == null ||
      p.progressDate > kept.progressDate ||
      (p.progressDate === kept.progressDate && (p.createdAt ?? '') > (kept.createdAt ?? ''));
    if (newer) latestByPledge.set(p.pledgeId, p);
  }

  // Saisies en cours (une par catégorie), pré-remplies depuis les engagements existants.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!goal || !pledgesQ.data) return;
    const next: Record<string, string> = {};
    for (const c of goal.categories) {
      const p = pledgesQ.data.find((x) => x.categoryId === c.id) ?? null;
      const v = p ? p.targetAmount ?? p.targetCount : null;
      next[c.id] = v != null ? String(v) : '';
    }
    setDrafts(next);
  }, [goal, pledgesQ.data]);

  const currency = goal?.defaultCurrency ?? 'EUR';
  // Deadline effective de l'année (Lot G2) — repli legacy sur celle du Goal.
  const yearDeadline =
    (year != null ? goal?.yearDeadlines?.[String(year)] : null) ?? goal?.submissionDeadline ?? null;
  const deadlinePast = yearDeadline != null && new Date(yearDeadline).getTime() < Date.now();

  const saveM = useMutation({
    mutationFn: ({ category, value }: { category: GoalCategory; value: number }) =>
      saveMemberPledge({
        categoryId: category.id,
        year: year ?? undefined,
        ...(category.unitType === 'CURRENCY' ? { targetAmount: value } : { targetCount: value }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals', 'member-pledges'] });
      push({ kind: 'ok', title: t('memberGoals.saved') });
    },
    onError: (err) => {
      // Contrat 422 : NO_ASSEMBLY_ATTACHMENT / PLEDGE_LOCKED / DEADLINE_PASSED —
      // le message FR du backend est affiché tel quel.
      const code = errCode(err);
      push({
        kind: 'error',
        title:
          code === 'PLEDGE_LOCKED' || code === 'DEADLINE_PASSED'
            ? t('memberGoals.lockedTitle')
            : t('memberGoals.saveRefused'),
        // PLEDGE_LOCKED : le message backend est en anglais — on affiche le nôtre, qui dit
        // en plus quoi faire (passer par le secrétariat).
        msg:
          code === 'PLEDGE_LOCKED'
            ? t('memberGoals.lockedAskSecretariat')
            : errMsg(err, t('goals.saveFailed')),
      });
    },
  });

  // Soumission du MEMBRE (décision JP 28/07) : acte personnel, indépendant de son assemblée.
  // Après coup, seuls le secrétariat peut rouvrir — d'où la confirmation explicite.
  const [submitOpen, setSubmitOpen] = useState(false);
  const submitM = useMutation({
    mutationFn: () => submitMyMemberPledges(year ?? undefined),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['goals', 'member-pledges'] });
      setSubmitOpen(false);
      push({
        kind: 'ok',
        title: t('memberGoals.submittedToast'),
        msg: t('memberGoals.submittedMsg', { count: res.lockedPledges }),
      });
    },
    onError: (err) => {
      const code = errCode(err);
      push({
        kind: 'error',
        title: t('memberGoals.submitRefused'),
        msg:
          code === 'NO_PLEDGE_TO_SUBMIT'
            ? t('memberGoals.noPledgeToSubmit')
            : code === 'ALREADY_SUBMITTED'
              ? t('memberGoals.alreadySubmitted')
              : errMsg(err, t('goals.submitFailed')),
      });
    },
  });

  // Déclaration d'état sur un de MES objectifs : le chiffre saisi remplace le précédent.
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressCat, setProgressCat] = useState('');
  const [progressValue, setProgressValue] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const progressM = useMutation({
    mutationFn: ({ pledgeId, category, value, note }: {
      pledgeId: string; category: GoalCategory; value: number; note: string;
    }) =>
      addProgress(pledgeId, {
        ...(category.unitType === 'CURRENCY' ? { amount: value } : { count: value }),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals', 'member-progress'] });
      setProgressOpen(false);
      setProgressValue('');
      setProgressNote('');
      push({ kind: 'ok', title: t('goals.progressSaved') });
    },
    onError: (err) =>
      push({ kind: 'error', title: t('memberGoals.saveRefused'), msg: errMsg(err, t('goals.saveFailed')) }),
  });

  const [savingCat, setSavingCat] = useState<string | null>(null);
  const save = (line: MemberLine) => {
    const raw = (drafts[line.category.id] ?? '').replace(',', '.').trim();
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value) || value < 0) {
      push({ kind: 'error', title: t('memberGoals.saveRefused'), msg: t('goals.invalidValue') });
      return;
    }
    setSavingCat(line.category.id);
    saveM.mutate({ category: line.category, value }, { onSettled: () => setSavingCat(null) });
  };

  const noGoal = (goalQ.error as { response?: { status?: number } } | null)?.response?.status === 404;

  const lines: MemberLine[] = goal
    ? [...goal.categories]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((category) => {
          const pledge = (pledgesQ.data ?? []).find((p) => p.categoryId === category.id) ?? null;
          const last = pledge ? latestByPledge.get(pledge.id) ?? null : null;
          return {
            id: category.id,
            category,
            pledge,
            achieved: last ? last.amount ?? last.count ?? null : null,
          };
        })
    : [];

  // État de MA soumission pour l'année : rien de déclaré / en cours / tout soumis.
  const myPledges = pledgesQ.data ?? [];
  const openPledges = myPledges.filter((p) => !p.locked);
  const allSubmitted = myPledges.length > 0 && openPledges.length === 0;
  const canSubmit = openPledges.length > 0 && !deadlinePast;

  // Sélecteur d'année : les années VISIBLES du Goal (les jalons), et non `openYears` qui porte
  // le droit d'ÉCRITURE — même source que la vue dirigeant et que le mobile.
  const selectableYears = goal?.visibleYears ?? goal?.openYears ?? [];

  // L'avancement porte sur un engagement EXISTANT : verrouillé ou non (déclarer où l'on en est
  // reste possible après la soumission), tant que la date limite n'est pas passée.
  const declarable = lines.filter((l) => l.pledge != null);
  const canDeclareProgress = declarable.length > 0 && !deadlinePast;
  const progressLine = declarable.find((l) => l.category.id === progressCat) ?? null;

  const cols: Column<MemberLine>[] = [
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
      label: t('memberGoals.colMyGoal'),
      style: { width: 200 },
      render: (l) => {
        const locked = l.pledge?.locked === true || deadlinePast;
        return locked ? (
          <strong>
            {l.pledge
              ? l.category.unitType === 'CURRENCY'
                ? fmtAmount(l.pledge.targetAmount ?? 0, currency)
                : `${l.pledge.targetCount ?? 0} ${l.category.unitLabel ?? ''}`.trim()
              : '—'}
          </strong>
        ) : (
          <input
            className="input"
            type="number"
            min={0}
            step={l.category.unitType === 'CURRENCY' ? '0.01' : '1'}
            value={drafts[l.category.id] ?? ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [l.category.id]: e.target.value }))}
            placeholder={
              l.category.unitType === 'CURRENCY'
                ? currencySymbol(currency)
                : l.category.unitLabel ?? ''
            }
          />
        );
      },
    },
    {
      label: t('goals.colProgress'),
      style: { width: 140 },
      render: (l) =>
        l.achieved == null ? (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        ) : (
          <strong>
            {l.category.unitType === 'CURRENCY'
              ? fmtAmount(l.achieved, currency)
              : `${l.achieved} ${l.category.unitLabel ?? ''}`.trim()}
          </strong>
        ),
    },
    {
      label: t('goals.colStatus'),
      render: (l) =>
        l.pledge == null ? (
          <Badge tone="gray">{t('goals.toComplete')}</Badge>
        ) : l.pledge.locked ? (
          <Badge tone="ok" dot>{t('memberGoals.locked')}</Badge>
        ) : (
          <Badge tone="warn" dot>{t('goals.draft')}</Badge>
        ),
    },
    {
      label: '',
      style: { width: 150 },
      cellStyle: { textAlign: 'right' },
      render: (l) =>
        l.pledge?.locked === true || deadlinePast ? null : (
          <Button
            size="sm"
            variant="primary"
            disabled={saveM.isPending && savingCat === l.category.id}
            onClick={() => save(l)}
          >
            {saveM.isPending && savingCat === l.category.id
              ? t('common.saving')
              : t('common.save')}
          </Button>
        ),
    },
  ];

  return (
    <>
      <TopBar
        title={t('memberGoals.title')}
        crumbs={[t('common.brand'), t('memberGoals.title')]}
        actions={
          <>
            {canDeclareProgress && (
              <Button
                iconL={<Icon name="plus" size={15} />}
                onClick={() => {
                  setProgressCat(declarable[0]?.category.id ?? '');
                  setProgressOpen(true);
                }}
              >
                {t('goals.addProgress')}
              </Button>
            )}
            {canSubmit && (
              <Button
                variant="primary"
                iconL={<Icon name="lock" size={15} />}
                onClick={() => setSubmitOpen(true)}
              >
                {t('memberGoals.submitMyPledges')}
              </Button>
            )}
            {selectableYears.length > 0 && year != null ? (
              <YearPicker years={selectableYears} value={year} onChange={setSelectedYear} />
            ) : null}
          </>
        }
      />

      <div className="content">
        {goalQ.isLoading || pledgesQ.isLoading ? (
          <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
        ) : noGoal ? (
          <div className="card" style={{ padding: 0 }}>
            <div className="empty">
              <div className="icon-wrap"><Icon name="inbox" size={26} /></div>
              <h4>{t('goals.noActiveGoal')}</h4>
              <p>{t('goals.noActiveGoalText')}</p>
            </div>
          </div>
        ) : !me?.goalUnitId ? (
          <div className="card" style={{ padding: 0 }}>
            <div className="empty">
              <div className="icon-wrap"><Icon name="warning" size={26} /></div>
              <h4>{t('goals.notAttached')}</h4>
              <p>{t('memberGoals.noAssembly')}</p>
            </div>
          </div>
        ) : goalQ.isError || pledgesQ.isError ? (
          <div className="card" style={{ padding: 0 }}>
            <div className="empty">
              <div className="icon-wrap"><Icon name="warning" size={26} /></div>
              <h4>{t('goals.errorTitle')}</h4>
              <p>{errMsg(goalQ.error ?? pledgesQ.error, t('goals.loadPledgesFailed'))}</p>
            </div>
          </div>
        ) : goal ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 4px' }}>{goal.name}</h3>
              <p style={{ margin: 0, fontSize: 13.5 }}>
                {deadlinePast && yearDeadline ? (
                  <strong style={{ color: 'var(--err, #B86A4A)' }}>
                    {t('memberGoals.deadlinePast', { date: fmtDateLabel(yearDeadline.slice(0, 10)) })}
                  </strong>
                ) : yearDeadline ? (
                  <strong style={{ color: 'var(--earth-700, #8E6B47)' }}>
                    {t('goals.submitBefore', { date: fmtDateLabel(yearDeadline.slice(0, 10)) })}
                  </strong>
                ) : null}
              </p>
            </div>

            {/* Hint : les objectifs personnels alimentent l'engagement de l'assemblée. */}
            <p
              style={{
                margin: '0 0 14px',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'var(--parchment-deep, #F2EDE2)',
                fontSize: 13.5,
                color: 'var(--ink-600)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="info" size={15} />
              {t('memberGoals.hint')}
            </p>

            {/* Soumis : plus rien n'est modifiable sans passer par le secrétariat. */}
            {allSubmitted && (
              <p
                style={{
                  margin: '0 0 14px',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'var(--green-50, #EAF1EC)',
                  fontSize: 13.5,
                  color: 'var(--green-800, #14241C)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Icon name="check" size={15} />
                {t('memberGoals.submittedBanner')}
              </p>
            )}

            <Table columns={cols} rows={lines} zebra />
          </>
        ) : null}
      </div>

      <Modal
        open={progressOpen}
        onClose={() => setProgressOpen(false)}
        title={t('goals.progressModalTitle')}
        sub={t('memberGoals.progressModalSub')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setProgressOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={!progressLine || progressM.isPending}
              onClick={() => {
                const raw = progressValue.replace(',', '.').trim();
                const value = Number(raw);
                if (!progressLine?.pledge || raw === '' || !Number.isFinite(value) || value < 0) {
                  push({ kind: 'error', title: t('memberGoals.saveRefused'), msg: t('goals.invalidValue') });
                  return;
                }
                progressM.mutate({
                  pledgeId: progressLine.pledge.id,
                  category: progressLine.category,
                  value,
                  note: progressNote,
                });
              }}
            >
              {progressM.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t('goals.colCategory')}>
            <Picker
              value={progressCat}
              onChange={setProgressCat}
              placeholder={t('common.choose')}
              options={declarable.map((l) => ({ id: l.category.id, label: l.category.name }))}
            />
          </Field>
          {progressLine && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-400)' }}>
              {t('goals.pledgedPaidRemaining', {
                pledged: fmtLineValue(progressLine, progressLine.pledge?.targetAmount ?? progressLine.pledge?.targetCount ?? 0, currency),
                paid: fmtLineValue(progressLine, progressLine.achieved ?? 0, currency),
                remaining: fmtLineValue(
                  progressLine,
                  Math.max(0, (progressLine.pledge?.targetAmount ?? progressLine.pledge?.targetCount ?? 0) - (progressLine.achieved ?? 0)),
                  currency,
                ),
              })}
            </p>
          )}
          <Field
            label={
              progressLine?.category.unitType === 'CURRENCY'
                ? t('goals.paidAmount', { symbol: currencySymbol(currency) })
                : t('goals.progressValue', { label: progressLine?.category.unitLabel ?? t('goals.labelNumber') })
            }
          >
            <Input
              value={progressValue}
              inputMode="decimal"
              onChange={(e) => setProgressValue(e.target.value.replace(/[^0-9.,]/g, ''))}
            />
          </Field>
          <Field label={t('goals.noteOptional')}>
            <Input value={progressNote} maxLength={500} onChange={(e) => setProgressNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title={t('memberGoals.submitModalTitle')}
        sub={t('memberGoals.submitModalSub')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={submitM.isPending}
              onClick={() => submitM.mutate()}
            >
              {submitM.isPending ? t('goals.submitting') : t('memberGoals.submitConfirm')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-700)' }}>
          {t('memberGoals.submitModalBody', { count: openPledges.length })}
        </p>
      </Modal>
    </>
  );
}
