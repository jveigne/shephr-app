import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Badge, Button, Table, TopBar, type Column } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import {
  fetchMyMemberPledges,
  getActiveGoal,
  saveMemberPledge,
  type GoalCategory,
  type PledgeResponse,
} from '../services/goalsApi';
import { currencySymbol, fmtAmount, fmtDateLabel } from '../utils/format';

// Feature A — « Mes objectifs » : le MEMBRE déclare son objectif personnel par catégorie.
// Ces objectifs alimentent l'agrégat des fidèles de son assemblée (members-aggregate).

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;

interface MemberLine {
  id: string;
  category: GoalCategory;
  pledge: PledgeResponse | null;
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
        msg: errMsg(err, t('goals.saveFailed')),
      });
    },
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
        .map((category) => ({
          id: category.id,
          category,
          pledge: (pledgesQ.data ?? []).find((p) => p.categoryId === category.id) ?? null,
        }))
    : [];

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
          goal && (goal.openYears?.length ?? 0) > 0 && year != null ? (
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
                {goal.openYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          ) : undefined
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

            <Table columns={cols} rows={lines} zebra />
          </>
        ) : null}
      </div>
    </>
  );
}
