import {
  listAssemblyLocalities,
  listStudyLocalities,
  listTeachingLocalities,
  type AssemblyLocality,
  type StudyLocalitySummary,
} from '@/services/assemblyApi';

/**
 * Une ville du « Suivi de la ville » (offre Néhémie, axe GÉOGRAPHIQUE) — fusion de
 * `GET /study/localities` (Bertoua, `ETUDE_SUIVI`) et de `GET /assembly/localities` (Journal,
 * `JOURNAL`), comme le web (`CityStudy.tsx`, P-08). `studyEntitled` / `journalEntitled` = null quand
 * la ville est absente de la liste correspondante (onglets absents). Même règle de visibilité des
 * deux côtés (D-ABO-21). D-FIN-08 (JP 06/11) : aussi `GET /teaching/localities` (enseignement, `ENSEIGNEMENT_SUIVI`),
 * `teachingEntitled` = null quand la ville en est absente.
 */
export interface CityEntry {
  localityId: string;
  localityName: string;
  studyEntitled: boolean | null;
  journalEntitled: boolean | null;
  teachingEntitled: boolean | null;
}

export function mergeCities(
  study: StudyLocalitySummary[],
  journal: AssemblyLocality[],
  teaching: AssemblyLocality[] = [],
): CityEntry[] {
  const byId = new Map<string, CityEntry>();
  for (const l of study) {
    byId.set(l.localityId, {
      localityId: l.localityId,
      localityName: l.localityName,
      studyEntitled: l.entitled,
      journalEntitled: null,
      teachingEntitled: null,
    });
  }
  for (const l of journal) {
    const prev = byId.get(l.localityId);
    byId.set(l.localityId, {
      localityId: l.localityId,
      localityName: prev?.localityName ?? l.localityName,
      studyEntitled: prev?.studyEntitled ?? null,
      journalEntitled: l.entitled,
      teachingEntitled: null,
    });
  }
  for (const l of teaching) {
    const prev = byId.get(l.localityId);
    byId.set(l.localityId, {
      localityId: l.localityId,
      localityName: prev?.localityName ?? l.localityName,
      studyEntitled: prev?.studyEntitled ?? null,
      journalEntitled: prev?.journalEntitled ?? null,
      teachingEntitled: l.entitled,
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.localityName.localeCompare(b.localityName, undefined, { sensitivity: 'base' }),
  );
}

/** Une ville ouvre au moins un onglet payant (Bertoua, Journal ou Enseignement) — sinon cadenas sur l'entrée. */
export function cityOpen(c: CityEntry): boolean {
  return c.studyEntitled === true || c.journalEntitled === true || c.teachingEntitled === true;
}

/**
 * Villes de l'entrée « Suivi de la ville » (tuile d'accueil et entrée de l'étude, JP 28/10 : même
 * règle que l'écran et que le menu web). Les lectures sont indépendantes ; un échec de l'une
 * n'efface pas les autres, un échec de toutes donne une liste vide (entrée masquée, sans plus).
 */
export async function loadCityFollowUp(hasAssembly: boolean): Promise<CityEntry[]> {
  const [study, journal, teaching] = await Promise.allSettled([
    listStudyLocalities(),
    hasAssembly ? listAssemblyLocalities() : Promise.resolve<AssemblyLocality[]>([]),
    listTeachingLocalities(),
  ]);
  return mergeCities(
    study.status === 'fulfilled' ? study.value : [],
    journal.status === 'fulfilled' ? journal.value : [],
    teaching.status === 'fulfilled' ? teaching.value : [],
  );
}
