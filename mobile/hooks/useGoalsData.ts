import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  fetchMyMemberPledges,
  getActiveGoal,
  getMyMemberProgress,
  getMyPledges,
  getMyProgress,
  type ActiveGoal,
  type GoalCategory,
  type PledgeResponse,
  type ProgressResponse,
} from '../services/goalsApi';

export type GoalsError = 'NO_GOAL' | 'NO_UNIT' | 'OTHER' | null;

/** Ligne d'engagement par catégorie : pledge (éventuel) + versé (UC-DIR-08). */
export interface GoalLine {
  category: GoalCategory;
  pledge: PledgeResponse | null;
  /** Dernier ÉTAT déclaré (Lot P1 — montant pour CURRENCY, nombre pour COUNT), pas une somme. */
  achieved: number;
  /** Cible déclarée (targetAmount ou targetCount selon le type). */
  target: number | null;
}

export interface GoalsData {
  goal: ActiveGoal | null;
  pledges: PledgeResponse[];
  progressByPledge: Record<string, ProgressResponse[]>;
  lines: GoalLine[];
  /** Soumis = au moins un pledge et tous verrouillés (UC-DIR-08 A3). */
  submitted: boolean;
  loading: boolean;
  error: GoalsError;
  reload: () => Promise<void>;
}

function classifyError(e: any): GoalsError {
  const status = e?.response?.status;
  const message: string = e?.response?.data?.message ?? '';
  if (status === 404) return 'NO_GOAL';
  if (status === 400 && /goal unit/i.test(message)) return 'NO_UNIT';
  if (message.includes('USER_NO_GOAL_UNIT')) return 'NO_UNIT';
  return 'OTHER';
}

export function pledgeTarget(p: PledgeResponse | null): number | null {
  if (!p) return null;
  return p.targetAmount ?? p.targetCount ?? null;
}

/**
 * Lot P1 (décision #13) : chaque avancement est une déclaration d'ÉTAT — le versé est la
 * déclaration la plus récente (progressDate puis createdAt), pas la somme des saisies.
 */
export function progressTotal(items: ProgressResponse[]): number {
  if (items.length === 0) return 0;
  const latest = items.reduce((a, b) => {
    if (b.progressDate !== a.progressDate) return b.progressDate > a.progressDate ? b : a;
    return (b.createdAt ?? '') > (a.createdAt ?? '') ? b : a;
  });
  return latest.amount ?? latest.count ?? 0;
}

/**
 * Feature A — mode « objectifs personnels du membre » : mêmes lignes, même écran, mais les
 * engagements ET leurs avancements viennent du niveau MEMBER (`/goals/member/me/...`) au lieu
 * de ceux de l'assemblée. Décision JP 28/07 : le membre déclare aussi l'état de SES objectifs.
 */
export function useGoalsData(selectedYear?: number | null, member = false): GoalsData {
  const [goal, setGoal] = useState<ActiveGoal | null>(null);
  const [pledges, setPledges] = useState<PledgeResponse[]>([]);
  const [progressByPledge, setProgressByPledge] = useState<
    Record<string, ProgressResponse[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<GoalsError>(null);

  const reload = useCallback(async () => {
    try {
      const g = await getActiveGoal();
      // Annualisation Lot 4.6 : année sélectionnée (défaut = année courante du Goal).
      const y = selectedYear ?? g.currentYear;
      // Lot 4.3 : un seul appel /me/progress remplace un listProgress par pledge.
      const [ps, progress] = await Promise.all([
        member ? fetchMyMemberPledges(y) : getMyPledges(y),
        member ? getMyMemberProgress(y) : getMyProgress(y),
      ]);
      const byPledge: Record<string, ProgressResponse[]> = {};
      for (const p of progress) {
        (byPledge[p.pledgeId] ??= []).push(p);
      }
      setGoal(g);
      setPledges(ps);
      setProgressByPledge(byPledge);
      setError(null);
    } catch (e) {
      setError(classifyError(e));
    } finally {
      setLoading(false);
    }
  }, [selectedYear, member]);

  useEffect(() => {
    reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const categories = [...(goal?.categories ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  const lines: GoalLine[] = categories.map((category) => {
    const pledge = pledges.find((p) => p.categoryId === category.id) ?? null;
    return {
      category,
      pledge,
      achieved: pledge ? progressTotal(progressByPledge[pledge.id] ?? []) : 0,
      target: pledgeTarget(pledge),
    };
  });

  const submitted = pledges.length > 0 && pledges.every((p) => p.locked);

  return {
    goal,
    pledges,
    progressByPledge,
    lines,
    submitted,
    loading,
    error,
    reload,
  };
}
