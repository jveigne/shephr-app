// ---------------------------------------------------------------------------------------------
//  Statistiques de Vie d'assemblée dans la Hiérarchie — D-ASM-18 (JP 08/10).
//
//  Module PUR (aucune dépendance React ni réseau) : agrégats calculés à partir des lignes de
//  `GET /assembly/stats` et de l'arbre de la hiérarchie déjà affiché.
//
//  Règles :
//    - périmètre = les assemblées portées par l'arbre (nodes.units aplatis, règle J-4 : pas
//      d'assemblées géographiques hors arbre), intersectées avec les lignes de /stats par unitId ;
//    - agrégat d'un dirigeant = ses assemblées + celles de tous ses descendants, dédoublonnées ;
//    - présence moyenne PONDÉRÉE = Σ attendanceTotal / Σ meetingCount (null si aucune réunion) ;
//    - personnes distinctes = Σ distinctAttendees — approximation ASSUMÉE (D-ASM-18) : une
//      personne présente dans deux assemblées compte deux fois (le backend ne dédoublonne que
//      par assemblée) ;
//    - assemblée active = meetingCount > 0 sur la période ;
//    - alerte = aucun CR, ou dernier CR il y a plus de ALERT_DAYS jours (3 semaines, D-ASM-18).
//      AFFICHAGE SEUL : aucune relance (D-ASM-09 reste gelé).
//    - AUCUN NOM de personne n'est produit ici : que des nombres et des noms d'assemblée.
// ---------------------------------------------------------------------------------------------
import type { UnitMeetingStats } from '../services/assemblyApi';
import type { LeaderHierarchyNode } from '../services/leadersApi';

/** D-ASM-18 (JP 08/10) : seuil d'alerte « sans CR » = 3 semaines. */
export const ALERT_DAYS = 21;

/** Ids des assemblées du sous-arbre d'un dirigeant (lui + descendants), dédoublonnés, ordre stable. */
export function subtreeUnitIds(node: LeaderHierarchyNode, acc: Set<string> = new Set()): string[] {
  for (const u of node.units) acc.add(u.id);
  for (const c of node.children) subtreeUnitIds(c, acc);
  return Array.from(acc);
}

/** Ids des assemblées de toute la hiérarchie affichée (toutes les racines). */
export function treeUnitIds(roots: LeaderHierarchyNode[]): string[] {
  const acc = new Set<string>();
  for (const r of roots) subtreeUnitIds(r, acc);
  return Array.from(acc);
}

/** 'yyyy-MM-dd' du jour, en heure locale. */
export function todayIso(today = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
}

/** Jours écoulés entre deux LocalDate 'yyyy-MM-dd' (calcul en UTC : pas de piège d'heure d'été). */
export function daysBetween(fromIso: string, toIso: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}

/** Alerte « sans CR depuis 3 semaines » : aucun CR, ou dernier CR il y a plus de ALERT_DAYS jours. */
export function isAlert(row: UnitMeetingStats, today: string): boolean {
  return row.lastMeetingDate == null || daysBetween(row.lastMeetingDate, today) > ALERT_DAYS;
}

/** Présence moyenne pondérée d'une ou plusieurs assemblées ; null si aucune réunion. */
export function averageAttendance(meetings: number, attendanceTotal: number): number | null {
  return meetings === 0 ? null : Math.round((attendanceTotal / meetings) * 10) / 10;
}

export interface HierarchyAggregate {
  /** Assemblées du périmètre présentes dans /stats, triées par nom. */
  rows: UnitMeetingStats[];
  total: number;
  active: number;
  meetings: number;
  attendanceTotal: number;
  /** Σ distinctAttendees — approximation assumée (cf. en-tête). */
  distinctAttendees: number;
  breadBreaking: number;
  average: number | null;
  /** Assemblées en alerte, triées par nom (noms d'ASSEMBLÉE seulement). */
  alertRows: UnitMeetingStats[];
}

const byUnitName = (a: UnitMeetingStats, b: UnitMeetingStats) =>
  a.unitName.localeCompare(b.unitName, undefined, { sensitivity: 'base' });

/** Agrégat d'un ensemble d'assemblées, intersecté avec les lignes de /stats. */
export function aggregate(
  unitIds: string[],
  statsById: Map<string, UnitMeetingStats>,
  today: string,
): HierarchyAggregate {
  const rows = Array.from(new Set(unitIds))
    .map((id) => statsById.get(id))
    .filter((r): r is UnitMeetingStats => !!r)
    .sort(byUnitName);
  const sum = (f: (r: UnitMeetingStats) => number) => rows.reduce((s, r) => s + f(r), 0);
  const meetings = sum((r) => r.meetingCount);
  const attendanceTotal = sum((r) => r.attendanceTotal);
  return {
    rows,
    total: rows.length,
    active: rows.filter((r) => r.meetingCount > 0).length,
    meetings,
    attendanceTotal,
    distinctAttendees: sum((r) => r.distinctAttendees),
    breadBreaking: sum((r) => r.breadBreakingCount),
    average: averageAttendance(meetings, attendanceTotal),
    alertRows: rows.filter((r) => isAlert(r, today)),
  };
}

/** Découpe une liste en paquets de `size` (appels /meetings : au plus 200 ids, on envoie 100). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
