/**
 * Statistiques de Vie d'assemblée dans la Hiérarchie — D-ASM-18 (JP 08/10).
 *
 * Module PUR (aucune dépendance React) : agrège les lignes de `GET /assembly/stats` sur les
 * assemblées portées par l'arbre de la Hiérarchie.
 * - Périmètre = assemblées de l'arbre déjà affiché (J-4 : jamais d'assemblée géographique hors
 *   arbre), intersectées avec les lignes de `/stats` par `unitId`. Aucune nouvelle règle d'accès :
 *   la lecture reste celle de RG-ASM-05, appliquée par le serveur.
 * - Agrégat d'un dirigeant = ses assemblées + celles de tous ses descendants, dédoublonnées.
 * - AUCUN NOM de personne (D-ASM-18) : que des nombres, et des noms d'assemblée.
 * - Alerte « sans CR depuis 3 semaines » : AFFICHAGE SEUL, aucune relance (D-ASM-09 reste gelé).
 */
import type { UnitMeetingStats } from '../services/assemblyApi';
import type { LeaderHierarchyNode } from '../services/leadersApi';

/** D-ASM-18 (JP 08/10) : seuil d'alerte « sans CR » = 3 semaines. */
export const ALERT_DAYS = 21;

/** Jours entiers entre deux dates 'yyyy-MM-dd' (calcul UTC : aucun décalage de fuseau). */
export function daysBetween(fromIso: string, toIso: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}

/** Alerte = aucun CR, ou dernier CR il y a plus de 21 jours (toutes périodes confondues). */
export function isAlert(row: UnitMeetingStats, todayIso: string): boolean {
  return row.lastMeetingDate == null || daysBetween(row.lastMeetingDate, todayIso) > ALERT_DAYS;
}

/** Présence moyenne pondérée (Σ présents / Σ réunions) ; null quand aucune réunion. */
export function averageAttendance(attendanceTotal: number, meetingCount: number): number | null {
  return meetingCount === 0 ? null : Math.round((attendanceTotal / meetingCount) * 10) / 10;
}

/** Identifiants des assemblées d'un nœud et de tous ses descendants, dédoublonnés. */
export function subtreeUnitIds(node: LeaderHierarchyNode): string[] {
  const ids = new Set<string>();
  const walk = (n: LeaderHierarchyNode) => {
    n.units.forEach((u) => ids.add(u.id));
    n.children.forEach(walk);
  };
  walk(node);
  return Array.from(ids);
}

/** Identifiants des assemblées de tout l'arbre (règle J-4 : seulement celles portées par l'arbre). */
export function treeUnitIds(roots: LeaderHierarchyNode[]): string[] {
  const ids = new Set<string>();
  roots.forEach((r) => subtreeUnitIds(r).forEach((id) => ids.add(id)));
  return Array.from(ids);
}

export interface AssemblyAggregate {
  /** Lignes `/stats` du périmètre, triées par nom d'assemblée. */
  rows: UnitMeetingStats[];
  unitCount: number;
  /** Assemblées ayant au moins une réunion sur la période. */
  activeCount: number;
  meetingCount: number;
  attendanceTotal: number;
  average: number | null;
  /**
   * Σ des personnes distinctes de chaque assemblée. Approximation ASSUMÉE (D-ASM-18) : une personne
   * qui fréquente deux assemblées du périmètre compte deux fois — le serveur ne renvoie les
   * distincts que par assemblée, et aucun nom ne doit remonter pour dédoublonner.
   */
  distinctAttendees: number;
  breadBreakingCount: number;
  /** Assemblées sans CR depuis 3 semaines (ou jamais), triées par nom. */
  alertRows: UnitMeetingStats[];
}

const byName = (a: UnitMeetingStats, b: UnitMeetingStats) =>
  a.unitName.localeCompare(b.unitName, undefined, { sensitivity: 'base' });

/** Agrège les lignes `/stats` des assemblées données (celles absentes de `/stats` sont ignorées). */
export function aggregate(
  unitIds: Iterable<string>,
  statsById: ReadonlyMap<string, UnitMeetingStats>,
  todayIso: string,
): AssemblyAggregate {
  const seen = new Set<string>();
  const rows: UnitMeetingStats[] = [];
  for (const id of unitIds) {
    const row = statsById.get(id);
    if (row && !seen.has(id)) {
      seen.add(id);
      rows.push(row);
    }
  }
  rows.sort(byName);
  const sum = (f: (r: UnitMeetingStats) => number) => rows.reduce((s, r) => s + f(r), 0);
  const meetingCount = sum((r) => r.meetingCount);
  const attendanceTotal = sum((r) => r.attendanceTotal);
  return {
    rows,
    unitCount: rows.length,
    activeCount: rows.filter((r) => r.meetingCount > 0).length,
    meetingCount,
    attendanceTotal,
    average: averageAttendance(attendanceTotal, meetingCount),
    distinctAttendees: sum((r) => r.distinctAttendees),
    breadBreakingCount: sum((r) => r.breadBreakingCount),
    alertRows: rows.filter((r) => isAlert(r, todayIso)),
  };
}
