import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  Picker,
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { YearPicker } from '../components/YearPicker';
import { StudyMemberActions, StudyNotesText } from '../components/StudyQuestionList';
import { useAuth } from '../hooks/useAuth';
import { type Language } from '../services/authApi';
import {
  adjustStudyAnswer,
  createPaperCopy,
  deletePaperCopy,
  finishStudySession,
  getMemberStudyProgress,
  getMyStudyProgress,
  getStudyCatalog,
  getStudyCopy,
  getStudyMe,
  getStudySession,
  getStudySessionResults,
  getStudyUnitProgress,
  listStudyLocalities,
  listStudyProgress,
  listStudySessions,
  openStudySession,
  updatePaperCopy,
  type StudyAnswerView,
  type StudyAssembly,
  type StudyCatchUp,
  type StudyLesson,
  type StudyCopyResult,
  type StudyCopySource,
  type StudyPersonProgress,
  type StudyQuestionView,
  type StudySessionStatus,
  type StudySessionSummary,
  type StudyUnitForAssembly,
  type StudyVerdict,
  type StudyUnitModuleProgress,
} from '../services/assemblyApi';
import { isStudyModuleOff, useStudyAccess, useStudyBase } from '../utils/studyAccess';
import { LockedFeature } from '../components/LockedFeature';
import { ENTITLEMENT_ETUDE_SUIVI, moduleAccessDenied, studyCityAccessDenied } from '../services/entitlementsApi';
import { toLocalDate } from '../utils/format';
import { formatMeetingDate } from '../utils/meetingReport';
import { EmptyState, ProgressBar, errCode, errMsg } from './Assembly';

// ---------------------------------------------------------------------------------------------
//  « Le Message de Bertoua » — Étude de l'assemblée, page à part (avenant ETU9 du 23/10).
//  D-ETU-31 (JP 23/10) : l'Étude sort de la page Vie d'assemblée — le contenu de l'ancien onglet
//  Étude d'`Assembly.tsx` est DÉPLACÉ ici (séances, résultats, copie papier, ajustement, avancement,
//  carte « Mon avancement »). Routes /study (AppShell) et /my-study (MemberShell).
//  D-ETU-50 (JP 27/10, lot « pro-plan ») : l'Étude est GRATUITE (D-ETU-28 levée) — garde =
//  FEATURES.study + compte rattaché, décision centralisée dans `utils/studyAccess.useStudyAccess`.
//  D-ETU-51 (JP 27/10) : la lecture « hiérarchie » d'une assemblée (au-dessus de son dirigeant et de
//  ses membres) exige `ETUDE_SUIVI` sur SA ville → 403 enrichi → `LockedFeature` compact + lien vers
//  `/study/city` (contrat 27/10 §12.1), jamais un toast. `/study/progress` filtre en silence les
//  assemblées des villes sans droit (D-ABO-28) : la page le signale par le même verrou compact.
//  D-ETU-14 levée (JP 27/10, décision n°3 — parité mobile → web, D-WEB-02) : le web pilote les
//  séances et y répond — accueil (séance en cours, À rattraper, Commencer) en tête de page, séance
//  dans `pages/StudySession.tsx` (`/study/session/:id`, `/my-study/session/:id`).
//  D-ETU-29 (JP 23/10) : le lien avec la Vie d'assemblée est le catalogue partagé, pas une clé.
// ---------------------------------------------------------------------------------------------

/**
 * Assemblée vue par l'Étude. D-ETU-28 (JP 23/10) : la page ne dépend PAS du module ASSEMBLY — la
 * liste vient des routes `/study/**` seules : `/study/progress` (une ligne par assemblée visible,
 * exactement `AssemblyService.listUnits`, D-ETU-08) complétée par `/study/me` (langue, dirigeant).
 * Écart noté au §12 du contrat (23/10) : la langue d'une assemblée hors `/study/me` est inconnue
 * (référence `FR` des pastilles, comme un backend antérieur à ETU8).
 */
interface StudyPageUnit {
  id: string;
  name: string;
  cityName: string | null;
  language: Language | null;
  /** Miroir d'`AssemblyServiceImpl.isAssemblyMember` (MEMBRE de cette assemblée) : lecture de SA note seule (D-ETU-10). */
  member: boolean;
  leader: boolean;
}

export function StudyPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const [unitId, setUnitId] = useState('');

  // RG-06 : sans abonnement STUDY, le module est invisible (le menu est déjà masqué) ; une URL
  // tapée à la main tombe sur un message plutôt que sur une cascade de 403.
  const { hasStudy, isLoading: accessLoading } = useStudyAccess();

  const studyMeQ = useQuery({ queryKey: ['assembly', 'study', 'me'], queryFn: getStudyMe, enabled: hasStudy });
  // Même clé que la vue d'ensemble de l'onglet (filtre « toutes les unités ») : un seul appel.
  const overviewQ = useQuery({
    queryKey: ['assembly', 'study', 'progress-all', ''],
    queryFn: () => listStudyProgress(undefined),
    enabled: hasStudy,
  });
  // §6.2 (plan du 21/10) : rien à afficher tant qu'aucune unité d'étude active n'a de questions.
  const catalogQ = useQuery({
    queryKey: ['assembly', 'study', 'catalog'],
    queryFn: () => getStudyCatalog(),
    enabled: hasStudy,
  });
  const catalog = useMemo(() => catalogQ.data ?? [], [catalogQ.data]);
  // D-ETU-50 : interrupteur plateforme STUDY coupé (403 de l'annotation) = « module non activé ».
  const moduleOff = [studyMeQ.error, catalogQ.error, overviewQ.error].some(isStudyModuleOff);
  // D-ABO-28 / contrat §9.3 : villes du lecteur (vide pour un membre, un dirigeant d'unité) — une ville
  // sans `ETUDE_SUIVI` cache ses assemblées de la vue d'ensemble ; on le dit par un verrou compact.
  const citiesQ = useQuery({
    queryKey: ['assembly', 'study', 'localities'],
    queryFn: listStudyLocalities,
    enabled: hasStudy,
    retry: false,
  });
  const lockedCity = (citiesQ.data ?? []).find((c) => !c.entitled) ?? null;
  const cityLock = lockedCity
    ? { moduleCode: ENTITLEMENT_ETUDE_SUIVI, nodeId: lockedCity.localityId, canSubscribe: lockedCity.canSubscribe }
    : null;

  const units: StudyPageUnit[] = useMemo(() => {
    const mine = new Map((studyMeQ.data?.assemblies ?? []).map((a) => [a.unitId, a]));
    const isMember = (id: string) => me?.goalRole === 'MEMBRE' && me?.goalUnitId === id;
    const byId = new Map<string, StudyPageUnit>();
    for (const o of overviewQ.data ?? []) {
      const a = mine.get(o.unitId);
      byId.set(o.unitId, {
        id: o.unitId,
        name: o.unitName,
        cityName: o.cityName,
        language: a?.language ?? null,
        member: isMember(o.unitId),
        leader: a?.leader ?? false,
      });
    }
    for (const a of mine.values()) {
      if (!byId.has(a.unitId)) {
        byId.set(a.unitId, {
          id: a.unitId,
          name: a.unitName,
          cityName: null,
          language: a.language,
          member: isMember(a.unitId),
          leader: a.leader,
        });
      }
    }
    // Comme `listUnits` : les assemblées que je dirige d'abord (sélection par défaut), puis l'ordre serveur.
    return Array.from(byId.values()).sort((x, y) => Number(y.leader) - Number(x.leader));
  }, [overviewQ.data, studyMeQ.data, me?.goalRole, me?.goalUnitId]);

  useEffect(() => {
    if (units.length > 0 && !units.some((u) => u.id === unitId)) setUnitId(units[0].id);
  }, [units, unitId]);

  const unit = units.find((u) => u.id === unitId) ?? null;

  const body = (() => {
    if (accessLoading || (hasStudy && (overviewQ.isLoading || studyMeQ.isLoading || catalogQ.isLoading))) {
      return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    }
    if (!hasStudy || moduleOff) {
      return <EmptyState title={t('assembly.study.moduleOff')} text={t('assembly.study.moduleOffHint')} />;
    }
    if (catalog.length === 0) {
      return <EmptyState title={t('assembly.study.noCatalog')} text={t('assembly.study.noCatalogHint')} />;
    }
    if (units.length === 0 || !unit) {
      // D-ABO-28 : vue d'ensemble vide parce que les villes du lecteur n'ont pas le suivi → verrou.
      return cityLock ? (
        <LockedFeature denied={cityLock} compact />
      ) : (
        <EmptyState title={t('assembly.noUnit')} text={t('assembly.noUnitHint')} />
      );
    }
    return (
      <>
        {/* D-WEB-02 (JP 27/10) : séance en cours, À rattraper, Commencer — assemblées de `/study/me`. */}
        <StudyHome assemblies={studyMeQ.data?.assemblies ?? []} />
        {units.length > 1 && (
          <Field label={t('assembly.unit')} style={{ maxWidth: 360, marginBottom: 16 }}>
            <Picker
              value={unitId}
              onChange={setUnitId}
              options={units.map((u) => ({ id: u.id, label: u.name, sub: u.cityName ?? undefined }))}
              placeholder={t('assembly.chooseUnit')}
            />
          </Field>
        )}
        <StudyTab
          key={unit.id}
          unit={unit}
          catalog={catalog}
          showOverview={units.length > 1}
          personal={unit.member || me?.goalUnitId === unit.id}
          cityLock={cityLock}
        />
      </>
    );
  })();

  return (
    <>
      <TopBar title={t('assembly.study.title')} crumbs={[t('common.brand'), t('assembly.study.title')]} />
      <div className="content">{body}</div>
    </>
  );
}


// ---------------------------------------------------------------------------------------------
//  Étude de l'assemblée (§6.2 du plan du 21/10, lot ETU5). Lecture = `canView` de l'assemblée
//  (D-ETU-08, RG-ETU-14 : séances, notes, avancement — jamais le contenu d'une copie) ; écriture
//  (copie papier D-ETU-13, ajustement RG-ETU-07b) = DIRIGEANT_UNITE de l'assemblée, signalé par le
//  `leader` du serveur (D-ETU-07), jamais recalculé ici. Le contenu d'une copie ne s'ouvre que pour
//  son auteur ou ce dirigeant (RG-ETU-13, D-ETU-09).
// ---------------------------------------------------------------------------------------------

type TFn = ReturnType<typeof useTranslation>['t'];

/** Points et notes : 2 décimales au plus, sans zéro inutile (contrat §1.1). */
function fmtPts(n: number | null | undefined, lang: string): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(n);
}

/** Instant ISO → date locale « jj/mm/aaaa ». */
const fmtInstant = (iso: string | null) => (iso ? formatMeetingDate(toLocalDate(new Date(iso))) : '—');

/** Note saisie : nombre ≥ 0 à 2 décimales au plus, virgule acceptée ; null si invalide. */
function parsePts(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : null;
}

/**
 * Message d'une erreur de l'étude : pas de réponse (réseau) → `errors.offline`, puis traduction du
 * code connu (`assembly.study.errors.*`), puis `message` du serveur (contrat §7). Partagé avec la
 * page de séance (D-WEB-02, JP 27/10).
 */
export const studyErrMsg = (err: unknown, t: TFn): string => {
  if (err && !(err as { response?: unknown }).response) return t('assembly.study.errors.offline');
  const code = errCode(err);
  return code
    ? t(`assembly.study.errors.${code}`, { defaultValue: errMsg(err, t('common.error')) })
    : errMsg(err, t('common.error'));
};

const STATUS_TONE: Record<StudySessionStatus, 'warn' | 'earth' | 'ok'> = {
  REPONSES_OUVERTES: 'warn',
  CORRECTION: 'earth',
  TERMINEE: 'ok',
};

/**
 * D-ETU-26 (JP 21/10) : pastille `FR` / `EN` pour chaque langue qui diffère de celle de référence
 * (l'assemblée, ou l'appelant pour « Mon avancement »). Rien si toutes coïncident ; un backend
 * antérieur à ETU8 (langues absentes) n'affiche rien, une référence absente vaut `FR`.
 */
function StudyLangBadges({ languages, reference }: { languages: (Language | null | undefined)[] | undefined; reference: Language | null | undefined }) {
  const { t } = useTranslation();
  const ref = reference ?? 'FR';
  const others = Array.from(new Set((languages ?? []).filter((l): l is Language => !!l && l !== ref)));
  if (others.length === 0) return null;
  return (
    <>
      {others.map((l) => (
        <span key={l} title={t(`assembly.study.language.hint.${l}`)} style={{ display: 'inline-flex' }}>
          <Badge tone="earth">{t(`assembly.study.language.badge.${l}`)}</Badge>
        </span>
      ))}
    </>
  );
}

function StudyStatusBadge({ status }: { status: StudySessionStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]} dot>{t(`assembly.study.status.${status}`)}</Badge>;
}

/** « UEMB002 · Leçon 2 — Le prix à payer ». */
function lessonLabel(s: Pick<StudySessionSummary, 'moduleCode' | 'lessonNumber' | 'lessonTitle'>, t: TFn): string {
  const head = [s.moduleCode, t('assembly.study.lesson', { n: s.lessonNumber })].filter(Boolean).join(' · ');
  return s.lessonTitle ? `${head} — ${s.lessonTitle}` : head;
}

/**
 * D-ETU-38 / D-ETU-40 (JP 23/10) : plage de la séance — « Questions 1 à 20 », ou « À partir de la
 * question 21 » tant que la fin n'est pas fixée (avant correction). Null pour un backend antérieur à
 * ETU11 (pas de plage).
 */
function rangeLabel(s: Pick<StudySessionSummary, 'firstQuestionNumber' | 'lastQuestionNumber'>, t: TFn): string | null {
  if (!s.firstQuestionNumber) return null;
  return s.lastQuestionNumber
    ? t('assembly.study.range', { first: s.firstQuestionNumber, last: s.lastQuestionNumber })
    : t('assembly.study.rangeOpen', { first: s.firstQuestionNumber });
}

/** D-ETU-38 : « Questions 1 à 20 · 20 questions » (le nombre vient du serveur). */
function rangeLine(s: StudySessionSummary, t: TFn): string | null {
  const range = rangeLabel(s, t);
  if (!range) return null;
  return s.questionCount != null ? `${range} · ${t('assembly.study.questionCount', { count: s.questionCount })}` : range;
}

/** Pastilles de source d'une copie : « Papier » (D-ETU-13), « Rattrapage » (D-ETU-46, JP 23/10). */
function SourceBadge({ source }: { source: StudyCopySource | null | undefined }) {
  const { t } = useTranslation();
  if (source === 'PAPIER') return <Badge tone="earth">{t('assembly.study.paper')}</Badge>;
  if (source === 'RATTRAPAGE') return <Badge tone="green">{t('assembly.study.catchUp')}</Badge>;
  return null;
}

const sectionTitle = {
  margin: 0,
  fontSize: 16,
  fontFamily: 'var(--font-serif)',
  color: 'var(--green-800)',
  fontWeight: 500,
} as const;

function StudyTab({
  unit,
  catalog,
  showOverview,
  personal,
  cityLock,
}: {
  unit: StudyPageUnit;
  catalog: StudyUnitForAssembly[];
  showOverview: boolean;
  /** Le compte est répondant de cette assemblée (D-ETU-06) : carte « Mon avancement ». */
  personal: boolean;
  /** D-ABO-28 : une ville du lecteur sans ETUDE_SUIVI (ses assemblées manquent à la vue d'ensemble). */
  cityLock: ReturnType<typeof moduleAccessDenied>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [filterModuleId, setFilterModuleId] = useState('');
  const [resultsId, setResultsId] = useState<string | null>(null);
  const [member, setMember] = useState<{ userId: string; fullName: string } | null>(null);
  const [copy, setCopy] = useState<{ id: string; canAdjust: boolean } | null>(null);

  // D-ETU-10 (JP 21/10) : un MEMBRE ne voit que SA progression — jamais les notes des autres,
  // donc ni la liste des résultats ni l'avancement par membre de son assemblée.
  const readerView = !unit.member;

  // D-ETU-51 : un 403 MODULE_ACCESS_DENIED n'est pas réessayé (verrou, pas une panne).
  const noRetryOnDenied = (count: number, err: unknown) => !moduleAccessDenied(err) && count < 1;
  const sessionsQ = useQuery({
    queryKey: ['assembly', 'study', 'sessions', unit.id],
    queryFn: () => listStudySessions(unit.id),
    enabled: readerView,
    retry: noRetryOnDenied,
  });
  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data]);
  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const s of sessions) set.add(new Date(s.openedAt).getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [sessions, currentYear]);
  const rows = sessions.filter((s) => new Date(s.openedAt).getFullYear() === year);

  const progressQ = useQuery({
    queryKey: ['assembly', 'study', 'unit-progress', unit.id],
    queryFn: () => getStudyUnitProgress(unit.id),
    enabled: readerView,
    retry: noRetryOnDenied,
  });
  const leader = progressQ.data?.leader ?? false;
  // D-ETU-51 (JP 27/10) : lecture « hiérarchie » d'une assemblée dont la ville n'a pas ETUDE_SUIVI.
  const unitLock = studyCityAccessDenied(sessionsQ.error) ?? studyCityAccessDenied(progressQ.error);

  const allQ = useQuery({
    queryKey: ['assembly', 'study', 'progress-all', filterModuleId],
    queryFn: () => listStudyProgress(filterModuleId || undefined),
    enabled: readerView && showOverview,
  });

  const sessionCols: Column<StudySessionSummary>[] = [
    { label: t('assembly.study.colDate'), render: (s) => <span style={{ fontWeight: 500 }}>{fmtInstant(s.openedAt)}</span> },
    {
      label: t('assembly.study.colLesson'),
      render: (s) => (
        <div>
          <div>{lessonLabel(s, t)}</div>
          {rangeLine(s, t) && <div style={{ color: 'var(--ink-600)', fontSize: 12.5 }}>{rangeLine(s, t)}</div>}
          <div style={{ color: 'var(--ink-500)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            {s.moduleName}
            <StudyLangBadges languages={[s.moduleLanguage]} reference={unit.language} />
          </div>
        </div>
      ),
    },
    { label: t('assembly.study.colStatus'), render: (s) => <StudyStatusBadge status={s.status} /> },
    { label: t('assembly.study.colCopies'), render: (s) => <span>{s.copyCount}</span> },
    { label: t('assembly.study.colMax'), render: (s) => <span>{fmtPts(s.maxScore, lang)}</span> },
    { label: '', style: { width: 40 }, render: () => <Icon name="chevRight" size={14} /> },
  ];

  type OverviewRow = { id: string; unitName: string; cityName: string | null; p: StudyUnitModuleProgress | null };
  const overviewRows: OverviewRow[] = useMemo(
    () =>
      (allQ.data ?? []).flatMap((u): OverviewRow[] =>
        u.modules.length === 0
          ? [{ id: u.unitId, unitName: u.unitName, cityName: u.cityName, p: null }]
          : u.modules.map((p) => ({ id: `${u.unitId}-${p.moduleId}`, unitName: u.unitName, cityName: u.cityName, p })),
      ),
    [allQ.data],
  );
  const pct = (p: StudyUnitModuleProgress) => (p.totalLessons > 0 ? Math.round((100 * p.lessonsDone) / p.totalLessons) : 0);
  const overviewCols: Column<OverviewRow>[] = [
    {
      label: t('assembly.study.colUnit'),
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.unitName}</div>
          {r.cityName && <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>{r.cityName}</div>}
        </div>
      ),
    },
    {
      label: t('assembly.study.colModule'),
      render: (r) => <span>{r.p ? [r.p.code, r.p.name].filter(Boolean).join(' · ') : '—'}</span>,
    },
    {
      label: t('assembly.study.colProgress'),
      style: { minWidth: 160 },
      render: (r) =>
        r.p ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}><ProgressBar percent={pct(r.p)} height={6} /></div>
            <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.p.lessonsDone}/{r.p.totalLessons}</span>
          </div>
        ) : (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        ),
    },
    {
      label: t('assembly.study.colLastSession'),
      render: (r) => <span style={{ color: 'var(--ink-500)' }}>{fmtInstant(r.p?.lastSessionAt ?? null)}</span>,
    },
  ];

  const openMine = (copyId: string) => setCopy({ id: copyId, canAdjust: false });

  return (
    <>
      {personal && <MyStudyProgressCard onOpenCopy={openMine} />}

      {readerView && (
        <>
          {unitLock ? (
            // Contrat 27/10 §12.1 : verrou compact + lien vers le suivi de la ville, à la place du contenu.
            <LockedFeature denied={unitLock} compact />
          ) : (
          <>
          {/* ---- Séances (pilotées depuis le mobile ou le web depuis D-WEB-02, JP 27/10) ---- */}
          <div className="card-head" style={{ padding: 0, border: 'none', marginBottom: 12 }}>
            <div>
              <div className="ttl">{t('assembly.study.sessionsTitle', { name: unit.name })}</div>
              <div className="sub">{t('assembly.study.sessionsSub')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <YearPicker years={years} value={year} onChange={setYear} />
            <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>
              {t('assembly.study.sessionCount', { count: rows.length })}
            </span>
          </div>
          {sessionsQ.isLoading ? (
            <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
          ) : (
            <Table
              columns={sessionCols}
              rows={rows}
              zebra
              // RG-ETU-08 / D-ETU-09 : aucun résultat ouvert pendant la CORRECTION (échange des écrans),
              // comme le lien « Résultats » masqué du panneau dirigeant (web et mobile).
              onRowClick={(s) => s.status !== 'CORRECTION' && setResultsId(s.id)}
              empty={<EmptyState title={t('assembly.study.noSession')} text={t('assembly.study.noSessionHint')} />}
            />
          )}

          {/* ---- Avancement de l'assemblée par membre (RG-ETU-17 / 17b) ---- */}
          <div className="card-head" style={{ padding: 0, border: 'none', margin: '28px 0 12px' }}>
            <div>
              <div className="ttl">{t('assembly.study.progressTitle', { name: unit.name })}</div>
              <div className="sub">{t('assembly.study.progressSub')}</div>
            </div>
          </div>
          {progressQ.isLoading ? (
            <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
          ) : (progressQ.data?.modules ?? []).length === 0 ? (
            <EmptyState title={t('assembly.study.noProgress')} text={t('assembly.study.noProgressHint')} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(progressQ.data?.modules ?? []).map((m) => (
                <div key={m.moduleId} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ ...sectionTitle, fontSize: 15.5 }}>{[m.code, m.name].filter(Boolean).join(' · ')}</h3>
                    {/* D-ETU-27 : leçons faites dans l'autre version de l'unité (même `code`). */}
                    <StudyLangBadges languages={m.languages} reference={unit.language} />
                    <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-500)' }}>
                      {t('assembly.study.lastSession', { date: fmtInstant(m.lastSessionAt) })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 12px' }}>
                    <div style={{ flex: 1 }}><ProgressBar percent={pct(m)} /></div>
                    <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {t('assembly.study.unitLessons', { done: m.lessonsDone, total: m.totalLessons })}
                    </span>
                  </div>
                  <Table
                    columns={[
                      { label: t('assembly.study.colName'), render: (r) => <span style={{ fontWeight: 500 }}>{r.fullName}</span> },
                      { label: t('assembly.study.colLessons'), render: (r) => <span>{r.lessonsDone}/{m.totalLessons}</span> },
                      {
                        label: t('assembly.study.colScore'),
                        render: (r) =>
                          r.lessonsDone === 0 ? (
                            <span style={{ color: 'var(--ink-400)' }}>—</span>
                          ) : (
                            <span>{t('assembly.study.scoreOf', { score: fmtPts(r.score, lang), max: fmtPts(r.maxScore, lang) })}</span>
                          ),
                      },
                      { label: '', style: { width: 40 }, render: () => <Icon name="chevRight" size={14} /> },
                    ]}
                    rows={m.members.map((r) => ({ ...r, id: r.userId }))}
                    zebra
                    onRowClick={(r) => setMember({ userId: r.userId, fullName: r.fullName })}
                    empty={<p style={{ color: 'var(--ink-400)', margin: 0, fontSize: 13 }}>{t('assembly.study.noMembers')}</p>}
                  />
                </div>
              ))}
            </div>
          )}

          </>
          )}

          {/* ---- Vue d'ensemble du périmètre (D-ETU-08 : géographie) ---- */}
          {showOverview && (
            <div style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <h3 style={sectionTitle}>{t('assembly.study.overview')}</h3>
                  <div className="section-sub" style={{ margin: '2px 0 0' }}>{t('assembly.study.overviewSub')}</div>
                </div>
                <Field label={t('assembly.study.unitFilter')} style={{ marginLeft: 'auto', minWidth: 240 }}>
                  <Picker
                    value={filterModuleId || 'all'}
                    onChange={(id) => setFilterModuleId(id === 'all' ? '' : id)}
                    options={[
                      { id: 'all', label: t('assembly.study.allUnits') },
                      // D-ETU-25 : sans `unitId`, le catalogue liste toutes les versions — la langue
                      // distingue deux versions d'un même `code` quand elle diffère de l'assemblée.
                      ...catalog.map((c) => ({
                        id: c.unit.moduleId,
                        label: [c.unit.code, c.unit.name].filter(Boolean).join(' · '),
                        sub:
                          c.unit.language && c.unit.language !== (unit.language ?? 'FR')
                            ? `${c.unit.bookTitle} · ${t(`assembly.study.language.badge.${c.unit.language}`)}`
                            : c.unit.bookTitle,
                      })),
                    ]}
                    placeholder={t('assembly.study.allUnits')}
                  />
                </Field>
              </div>
              {allQ.isLoading ? (
                <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
              ) : (
                <Table columns={overviewCols} rows={overviewRows} zebra />
              )}
              {/* D-ABO-28 : les assemblées d'une ville sans ETUDE_SUIVI ne figurent pas dans la liste. */}
              {cityLock && (
                <div style={{ marginTop: 14 }}>
                  <LockedFeature denied={cityLock} compact />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {resultsId && (
        <StudyResultsModal
          sessionId={resultsId}
          onClose={() => setResultsId(null)}
          onOpenCopy={(id) => setCopy({ id, canAdjust: true })}
        />
      )}
      {member && (
        <MemberStudyProgressModal
          userId={member.userId}
          fullName={member.fullName}
          language={unit.language}
          onClose={() => setMember(null)}
          // §4.8 : le lien vers une copie n'est affiché qu'au dirigeant de l'assemblée (RG-ETU-18).
          onOpenCopy={leader ? (id) => setCopy({ id, canAdjust: true }) : undefined}
        />
      )}
      {copy && <StudyCopyModal copyId={copy.id} canAdjust={copy.canAdjust} onClose={() => setCopy(null)} />}
    </>
  );
}

/** D-ETU-10 : progression d'une personne — leçons faites par unité, meilleure note par leçon, note cumulée. */
function StudyPersonProgressView({
  progress,
  onOpenCopy,
  reference,
}: {
  progress: StudyPersonProgress;
  /** D-ETU-26 : langue de référence des pastilles (assemblée, ou appelant pour « Mon avancement »). */
  reference: Language | null | undefined;
  /** Absent : pas de lien vers les copies (RG-ETU-13). */
  onOpenCopy?: (copyId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (progress.modules.length === 0) {
    return <p style={{ color: 'var(--ink-400)', margin: 0, fontSize: 13 }}>{t('assembly.study.noProgressHint')}</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      {progress.modules.map((m) => (
        <div key={m.moduleId} className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ ...sectionTitle, fontSize: 15.5 }}>{[m.code, m.name].filter(Boolean).join(' · ')}</h3>
            <StudyLangBadges languages={m.languages} reference={reference} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 4px' }}>
            <div style={{ flex: 1 }}>
              <ProgressBar percent={m.totalLessons > 0 ? (100 * m.lessonsDone) / m.totalLessons : 0} />
            </div>
            <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
              {t('assembly.study.lessonsDone', { done: m.lessonsDone, total: m.totalLessons })}
            </span>
          </div>
          {m.lessonsDone > 0 && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {t('assembly.study.cumulative', { score: fmtPts(m.score, lang), max: fmtPts(m.maxScore, lang) })}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {m.lessons.map((l) => (
              <div key={l.chapterId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: l.done ? 'var(--green-700)' : 'var(--ink-400)', display: 'inline-flex' }}>
                  <Icon name={l.done ? 'check' : 'x'} size={12} />
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('assembly.study.lesson', { n: l.number })}
                  {l.title && <span style={{ color: 'var(--ink-500)' }}> · {l.title}</span>}
                </span>
                {l.done ? (
                  <>
                    <SourceBadge source={l.bestSource} />
                    <span style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {t('assembly.study.scoreOf', { score: fmtPts(l.bestScore, lang), max: fmtPts(l.maxScore, lang) })}
                    </span>
                    {/* Copie papier : note seule, rien à ouvrir. D-ETU-43 : bestCopyId null si plusieurs copies ont contribué. */}
                    {onOpenCopy && l.bestCopyId && l.bestSource !== 'PAPIER' && (
                      <Button size="sm" variant="ghost" onClick={() => onOpenCopy(l.bestCopyId as string)}>
                        {t('assembly.study.view')}
                      </Button>
                    )}
                  </>
                ) : (l.coveredQuestions ?? 0) > 0 && l.totalQuestions ? (
                  // D-ETU-43 (JP 23/10) : leçon commencée — « 20 / 57 questions » (compteurs du serveur).
                  <span style={{ color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
                    {t('assembly.study.questionsCovered', { covered: l.coveredQuestions, total: l.totalQuestions })}
                  </span>
                ) : (
                  <span style={{ color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>{t('assembly.study.toDo')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** `/my-assembly` (et répondant rattaché) : « Mon avancement — Le Message de Bertoua », lecture seule. */
function MyStudyProgressCard({ onOpenCopy }: { onOpenCopy: (copyId: string) => void }) {
  const { t } = useTranslation();
  // §11.4 : `/study/me/progress` renvoie la version dans la langue de l'appelant.
  const { me } = useAuth();
  const mineQ = useQuery({ queryKey: ['assembly', 'study', 'me-progress'], queryFn: getMyStudyProgress });
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="card-head" style={{ padding: 0, border: 'none', marginBottom: 12 }}>
        <div>
          <div className="ttl">{t('assembly.study.myProgressTitle')}</div>
          <div className="sub">{t('assembly.study.myProgressSub')}</div>
        </div>
      </div>
      {mineQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : mineQ.data ? (
        <StudyPersonProgressView progress={mineQ.data} onOpenCopy={onOpenCopy} reference={me?.language} />
      ) : (
        <p style={{ color: 'var(--ink-400)', margin: 0, fontSize: 13 }}>{t('common.retryLater')}</p>
      )}
    </div>
  );
}

function MemberStudyProgressModal({
  userId,
  fullName,
  language,
  onClose,
  onOpenCopy,
}: {
  userId: string;
  fullName: string;
  /** D-ETU-26 : langue de l'assemblée d'où l'on ouvre la fiche. */
  language: Language | null | undefined;
  onClose: () => void;
  onOpenCopy?: (copyId: string) => void;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['assembly', 'study', 'member-progress', userId],
    queryFn: () => getMemberStudyProgress(userId),
  });
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={t('assembly.study.memberProgressTitle', { name: q.data?.fullName ?? fullName })}
      footer={<Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}
    >
      {q.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : q.data ? (
        <StudyPersonProgressView progress={q.data} onOpenCopy={onOpenCopy} reference={language} />
      ) : (
        <p style={{ color: 'var(--err)', margin: 0 }}>{studyErrMsg(q.error, t)}</p>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
//  Résultats d'une séance (RG-ETU-14) — présents avec note et pastille « papier ». Dirigeant :
//  ajouter / modifier / supprimer une copie papier (D-ETU-13, même séance terminée), ouvrir une
//  copie APP pour ajuster des points (RG-ETU-07b).
// ---------------------------------------------------------------------------------------------

export function StudyResultsModal({
  sessionId,
  onClose,
  onOpenCopy,
}: {
  sessionId: string;
  onClose: () => void;
  onOpenCopy: (copyId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { push } = useToast();
  const qc = useQueryClient();

  const resultsQ = useQuery({
    queryKey: ['assembly', 'study', 'results', sessionId],
    queryFn: () => getStudySessionResults(sessionId),
  });
  const r = resultsQ.data ?? null;
  const leader = r?.leader ?? false;
  // D-ETU-36 (JP 23/10) : « Cette semaine, chaque membre doit : » dans le détail d'une séance
  // TERMINEE seulement (web, avenant §6) — lu sur §4.4, qui ne les envoie à un non-dirigeant qu'à
  // TERMINEE. Toute erreur = pas de bloc (les résultats restent affichés).
  const finished = r?.session.status === 'TERMINEE';
  const detailQ = useQuery({
    queryKey: ['assembly', 'study', 'session', sessionId],
    queryFn: () => getStudySession(sessionId),
    enabled: finished,
  });
  const memberActions = finished ? (detailQ.data?.memberActions ?? []).filter((a) => a.trim() !== '') : [];
  const max = r?.session.maxScore ?? 0;
  // D-ETU-48 (JP 23/10) : copie papier (ajout, modification) à partir de CORRECTION seulement — la
  // plage est alors fixée ; en REPONSES_OUVERTES le serveur répond 422 STUDY_PAPER_COPY_TOO_EARLY.
  // La suppression reste offerte (copie saisie avant ETU11b).
  const paperAllowed = r != null && r.session.status !== 'REPONSES_OUVERTES';

  const [adding, setAdding] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newScore, setNewScore] = useState('');
  const [editing, setEditing] = useState<StudyCopyResult | null>(null);
  const [editScore, setEditScore] = useState('');
  const [deleting, setDeleting] = useState<StudyCopyResult | null>(null);

  /** D-ETU-13 : note dans [0, maxScore] (sinon 422 STUDY_SCORE_OUT_OF_RANGE) — contrôlée avant envoi. */
  const validScore = (raw: string) => {
    const n = parsePts(raw);
    return n != null && n <= max ? n : null;
  };

  // Une note change séance, avancement et vue d'ensemble : tout l'arbre « study » est relu.
  const invalidate = () => qc.invalidateQueries({ queryKey: ['assembly', 'study'] });
  const onError = (title: string) => (err: unknown) => push({ kind: 'error', title, msg: studyErrMsg(err, t) });

  const createM = useMutation({
    mutationFn: () => createPaperCopy(sessionId, { userId: newUserId, score: validScore(newScore) as number }),
    onSuccess: () => {
      invalidate();
      push({ kind: 'ok', title: t('assembly.study.paperCreated') });
      setAdding(false);
      setNewUserId('');
      setNewScore('');
    },
    onError: onError(t('assembly.study.saveFailed')),
  });
  const updateM = useMutation({
    mutationFn: (c: StudyCopyResult) => updatePaperCopy(c.id, { score: validScore(editScore) as number }),
    onSuccess: () => {
      invalidate();
      push({ kind: 'ok', title: t('assembly.study.paperUpdated') });
      setEditing(null);
    },
    onError: onError(t('assembly.study.saveFailed')),
  });
  const deleteM = useMutation({
    mutationFn: (c: StudyCopyResult) => deletePaperCopy(c.id),
    onSuccess: () => {
      invalidate();
      push({ kind: 'ok', title: t('assembly.study.paperDeleted') });
      setDeleting(null);
    },
    onError: onError(t('assembly.study.deleteFailed')),
  });

  const cols: Column<StudyCopyResult>[] = [
    {
      label: t('assembly.study.colName'),
      render: (c) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
          {c.displayName}
          <SourceBadge source={c.source} />
          {/* D-ETU-46 (JP 23/10) : ouvertes d'un rattrapage sans avis (comptent 0 tant que non revues). */}
          {leader && c.pendingReview && <Badge tone="warn" dot>{t('assembly.study.pendingReview')}</Badge>}
        </span>
      ),
    },
    {
      label: t('assembly.study.colScore'),
      render: (c) => <span>{t('assembly.study.scoreOf', { score: fmtPts(c.score, lang), max: fmtPts(c.maxScore, lang) })}</span>,
    },
    {
      label: t('assembly.study.colAnswers'),
      render: (c) =>
        c.source !== 'PAPIER' ? (
          <span style={{ color: 'var(--ink-500)' }}>{t('assembly.study.answeredCount', { count: c.answeredCount })}</span>
        ) : (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        ),
    },
    ...(leader
      ? [
          {
            label: '',
            style: { width: 90 },
            render: (c: StudyCopyResult) =>
              c.source === 'PAPIER' ? (
                <span style={{ display: 'inline-flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  {paperAllowed && (
                    <IconButton
                      icon={<Icon name="edit" size={14} />}
                      title={t('common.edit')}
                      onClick={() => {
                        setEditing(c);
                        setEditScore(String(c.score));
                      }}
                    />
                  )}
                  <IconButton
                    danger
                    icon={<Icon name="trash" size={14} />}
                    title={t('common.delete')}
                    onClick={() => setDeleting(c)}
                  />
                </span>
              ) : (
                <span title={t('assembly.study.openCopy')}>
                  <Icon name="chevRight" size={14} />
                </span>
              ),
          } as Column<StudyCopyResult>,
        ]
      : []),
  ];

  const pendingCount = leader ? (r?.copies ?? []).filter((c) => c.pendingReview).length : 0;
  const newScoreOk = validScore(newScore) != null;
  const editScoreOk = validScore(editScore) != null;

  return (
    <>
      <Modal
        open
        size="lg"
        onClose={onClose}
        title={r ? t('assembly.study.resultsTitle', { lesson: lessonLabel(r.session, t) }) : t('common.loading')}
        sub={r ? `${r.session.unitName} · ${fmtInstant(r.session.openedAt)} · ${r.session.moduleName}` : undefined}
        footer={
          <>
            {leader && paperAllowed && !adding && (
              <Button
                variant="secondary"
                iconL={<Icon name="plus" size={14} />}
                style={{ marginRight: 'auto' }}
                disabled={(r?.withoutCopy ?? []).length === 0}
                title={(r?.withoutCopy ?? []).length === 0 ? t('assembly.study.noMemberLeft') : undefined}
                onClick={() => setAdding(true)}
              >
                {t('assembly.study.addPaper')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          </>
        }
      >
        {resultsQ.isLoading ? (
          <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
        ) : !r ? (
          <p style={{ color: 'var(--err)', margin: 0 }}>{studyErrMsg(resultsQ.error, t)}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StudyStatusBadge status={r.session.status} />
              {rangeLine(r.session, t) && <span style={{ fontSize: 13 }}>{rangeLine(r.session, t)}</span>}
              <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>
                {t('assembly.study.maxScore', { max: fmtPts(r.session.maxScore, lang) })}
              </span>
            </div>
            {pendingCount > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-600)' }}>
                <Icon name="info" size={15} />
                <span>{t('assembly.study.pendingReviewCount', { count: pendingCount })}</span>
              </div>
            )}
            {r.session.status !== 'TERMINEE' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-600)' }}>
                <Icon name="info" size={15} />
                <span>{t('assembly.study.resultsOpenHint')}</span>
              </div>
            )}
            {leader && r.session.status === 'REPONSES_OUVERTES' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-600)' }}>
                <Icon name="info" size={15} />
                <span>{t('assembly.study.paperAfterCorrection')}</span>
              </div>
            )}

            {memberActions.length > 0 && (
              // D-ETU-37 (JP 23/10) : texte brut, retours à la ligne conservés (pas de Markdown).
              <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{t('assembly.study.memberActionsTitle')}</strong>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
                  {memberActions.map((a, i) => (
                    <li key={i} style={{ whiteSpace: 'pre-wrap' }}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {adding && paperAllowed && (
              <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <strong style={{ fontSize: 13 }}>{t('assembly.study.addPaper')}</strong>
                <span style={{ color: 'var(--ink-500)', fontSize: 12.5 }}>{t('assembly.study.addPaperHint')}</span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <Field label={t('assembly.study.member')} style={{ flex: '1 1 220px', margin: 0 }}>
                    <Picker
                      value={newUserId}
                      onChange={setNewUserId}
                      options={r.withoutCopy.map((m) => ({ id: m.userId, label: m.fullName }))}
                      placeholder={t('assembly.study.chooseMember')}
                    />
                  </Field>
                  <Field
                    label={t('assembly.study.score')}
                    hint={t('assembly.study.scoreHint', { max: fmtPts(max, lang) })}
                    style={{ flex: '0 1 140px', margin: 0 }}
                  >
                    <Input inputMode="decimal" value={newScore} onChange={(e) => setNewScore(e.target.value)} />
                  </Field>
                </div>
                {newScore.trim() !== '' && !newScoreOk && (
                  <span style={{ color: 'var(--err)', fontSize: 12.5 }}>
                    {t('assembly.study.scoreInvalid', { max: fmtPts(max, lang) })}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button variant="ghost" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
                  <Button
                    variant="primary"
                    disabled={!newUserId || !newScoreOk || createM.isPending}
                    onClick={() => createM.mutate()}
                  >
                    {createM.isPending ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>
            )}

            <Table
              columns={cols}
              rows={r.copies}
              zebra
              // RG-ETU-13 : seul le dirigeant ouvre une copie (APP / RATTRAPAGE ; une copie papier n'a que sa note).
              onRowClick={leader ? (c) => c.source !== 'PAPIER' && onOpenCopy(c.id) : undefined}
              empty={<EmptyState title={t('assembly.study.noCopy')} text={t('assembly.study.noCopyHint')} />}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title={t('assembly.study.editPaper', { name: editing?.displayName ?? '' })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={!editScoreOk || updateM.isPending}
              onClick={() => editing && updateM.mutate(editing)}
            >
              {updateM.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('assembly.study.score')} hint={t('assembly.study.scoreHint', { max: fmtPts(max, lang) })}>
          <Input inputMode="decimal" value={editScore} onChange={(e) => setEditScore(e.target.value)} />
        </Field>
        {editScore.trim() !== '' && !editScoreOk && (
          <p style={{ color: 'var(--err)', fontSize: 12.5, margin: '6px 0 0' }}>
            {t('assembly.study.scoreInvalid', { max: fmtPts(max, lang) })}
          </p>
        )}
      </Modal>

      <Modal
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={t('common.deleteTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={deleteM.isPending}
              onClick={() => deleting && deleteM.mutate(deleting)}
            >
              {deleteM.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t('assembly.study.deletePaperConfirm', { name: deleting?.displayName ?? '' })}</p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Contenu d'une copie (RG-ETU-13 / RG-ETU-18) — auteur ou dirigeant de l'assemblée, réponses
//  personnelles comprises (D-ETU-09). Dirigeant : ajustement des points de toute question notée,
//  à tout moment, même sans réponse et après TERMINEE (D-ETU-12, RG-ETU-07b).
// ---------------------------------------------------------------------------------------------

/** RG-ETU-07 : avis possibles sur une ouverte (barème appliqué par le serveur). */
const VERDICTS: StudyVerdict[] = ['JUSTE', 'A_PRECISER', 'A_REVOIR'];

/** RG-ETU-09 : EXERCICE et CONSIGNE ne sont pas notés. */
const isGraded = (q: StudyQuestionView) => q.type !== 'EXERCICE' && q.type !== 'CONSIGNE';

/** Valeurs d'un champ `valueOptions` / `answerKey` → libellés (§2.3). */
function optionLabels(q: StudyQuestionView, values: string[], t: TFn): string {
  return values
    .map((v) => {
      if (v === 'VRAI' || v === 'FAUX' || v === 'OUI' || v === 'NON') return t(`assembly.study.value.${v}`);
      const o = (q.options ?? []).find((x) => x.key === v);
      return o ? `${o.key}. ${o.label}` : v;
    })
    .join(' · ');
}

function givenAnswer(q: StudyQuestionView, a: StudyAnswerView | undefined, t: TFn): string | null {
  if (!a) return null;
  if (q.type === 'EXERCICE') return a.done ? t('assembly.study.done') : null;
  if (a.valueText) return a.valueText;
  if (a.valueOptions && a.valueOptions.length > 0) return optionLabels(q, a.valueOptions, t);
  return null;
}

function expectedAnswer(q: StudyQuestionView, t: TFn): string | null {
  if (q.answerKey && q.answerKey.length > 0) return optionLabels(q, q.answerKey, t);
  return q.expectedAnswer;
}

export function StudyCopyModal({ copyId, canAdjust, onClose }: { copyId: string; canAdjust: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { push } = useToast();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const copyQ = useQuery({
    queryKey: ['assembly', 'study', 'copy', copyId],
    queryFn: () => getStudyCopy(copyId),
  });
  const d = copyQ.data ?? null;
  // Pas de détail par question sur une copie papier en V1 (§4.6) : on y modifie la note seule.
  // D-ETU-46 (JP 23/10) : une copie de rattrapage s'ajuste comme une copie APP.
  const adjustable = canAdjust && d != null && d.copy.source !== 'PAPIER';
  // D-ETU-44 / D-ETU-46 (JP 23/10) : sur un rattrapage, les ouvertes attendent l'avis du dirigeant —
  // Juste / À préciser / À revoir passent par l'ajustement, points = barème du verdict côté serveur.
  const reviewable = adjustable && d?.copy.source === 'RATTRAPAGE';

  const answers = useMemo(() => new Map((d?.copy.answers ?? []).map((a) => [a.questionId, a])), [d]);
  const questions = useMemo(() => [...(d?.questions ?? [])].sort((a, b) => a.orderIndex - b.orderIndex), [d]);
  // RG-ETU-08 / D-ETU-09 : une PERSONNELLE n'est jamais montrée tant que la séance n'est pas TERMINEE,
  // même au dirigeant (miroir de StudyCopySheet mobile) — ne pas « simplifier ».
  const maskPersonal = d != null && d.session.status !== 'TERMINEE';

  const adjustM = useMutation({
    mutationFn: (v: { questionId: string; points?: number; verdict?: StudyVerdict }) =>
      adjustStudyAnswer(copyId, v.questionId, v.verdict ? { verdict: v.verdict } : { points: v.points }),
    onSuccess: (data, v) => {
      qc.setQueryData(['assembly', 'study', 'copy', copyId], data);
      qc.invalidateQueries({ queryKey: ['assembly', 'study'] });
      setDrafts(({ [v.questionId]: _, ...rest }) => rest);
      push({ kind: 'ok', title: t('assembly.study.adjustedOk') });
    },
    onError: (err) => push({ kind: 'error', title: t('assembly.study.saveFailed'), msg: studyErrMsg(err, t) }),
  });

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={d ? t('assembly.study.copyTitle', { name: d.copy.displayName }) : t('common.loading')}
      sub={d ? `${lessonLabel(d.session, t)} · ${d.session.unitName} · ${fmtInstant(d.session.openedAt)}` : undefined}
      footer={<Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}
    >
      {copyQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : !d ? (
        <p style={{ color: 'var(--err)', margin: 0 }}>{studyErrMsg(copyQ.error, t)}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15 }}>
              {t('assembly.study.copyScore', { score: fmtPts(d.copy.score, lang), max: fmtPts(d.copy.maxScore, lang) })}
            </strong>
            <SourceBadge source={d.copy.source} />
            <StudyStatusBadge status={d.session.status} />
            {rangeLabel(d.session, t) && <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>{rangeLabel(d.session, t)}</span>}
            {d.copy.submittedAt && (
              <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                {t('assembly.study.submittedAt', { date: fmtInstant(d.copy.submittedAt) })}
              </span>
            )}
          </div>
          {d.copy.source === 'PAPIER' ? (
            <p style={{ color: 'var(--ink-500)', margin: 0, fontSize: 13 }}>{t('assembly.study.paperNoDetail')}</p>
          ) : (
            questions.map((q) => {
              if (q.type === 'CONSIGNE') {
                return (
                  <div key={q.id} style={{ fontSize: 13.5, color: 'var(--ink-600)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                    {q.number}. {q.statement}
                  </div>
                );
              }
              const a = answers.get(q.id);
              const given = givenAnswer(q, a, t);
              if (maskPersonal && q.type === 'PERSONNELLE') {
                return (
                  <div
                    key={q.id}
                    style={{
                      marginLeft: q.parentId ? 22 : 0,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--line)',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 13.5,
                    }}
                  >
                    <strong>{q.number}.</strong>
                    <span style={{ color: given ? 'var(--ok)' : 'var(--ink-400)', display: 'inline-flex' }}>
                      <Icon name={given ? 'check' : 'x'} size={13} />
                    </span>
                    <span style={{ color: 'var(--ink-700)' }}>
                      {given ? t('assembly.study.answer.personalAnswered') : t('assembly.study.answer.personalNotAnswered')}
                    </span>
                  </div>
                );
              }
              const expected = expectedAnswer(q, t);
              const draft = drafts[q.id] ?? '';
              const draftPts = parsePts(draft);
              const draftOk = draftPts != null && draftPts <= q.points;
              return (
                <div
                  key={q.id}
                  style={{
                    marginLeft: q.parentId ? 22 : 0,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13.5 }}>{q.number}.</strong>
                    <span style={{ flex: '1 1 240px', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{q.statement}</span>
                    <Badge tone="gray">{t(`assembly.study.type.${q.type}`)}</Badge>
                  </div>
                  {q.bibleReference && <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{q.bibleReference}</div>}
                  {q.type === 'PERSONNELLE' && (
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Icon name="lock" size={12} />
                      {t('assembly.study.personalNote')}
                    </div>
                  )}
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--ink-500)' }}>{t('assembly.study.given')} : </span>
                    {given ? (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{given}</span>
                    ) : (
                      <span style={{ color: 'var(--ink-400)' }}>{t('assembly.study.noAnswer')}</span>
                    )}
                  </div>
                  {expected && q.type !== 'EXERCICE' && (
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: 'var(--ink-500)' }}>{t('assembly.study.expected')} : </span>
                      <span style={{ whiteSpace: 'pre-wrap' }}>{expected}</span>
                    </div>
                  )}
                  {isGraded(q) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                      <strong>
                        {a?.points == null && !a?.adjusted
                          ? `— / ${fmtPts(q.points, lang)}`
                          : t('assembly.study.scoreOf', { score: fmtPts(a?.points, lang), max: fmtPts(q.points, lang) })}
                      </strong>
                      {a?.verdict && <Badge tone={a.verdict === 'JUSTE' ? 'ok' : a.verdict === 'A_PRECISER' ? 'warn' : 'err'}>{t(`assembly.study.verdict.${a.verdict}`)}</Badge>}
                      {a?.adjusted && <Badge tone="green">{t('assembly.study.adjusted')}</Badge>}
                      {a && a.points == null && !a.adjusted && (
                        <span style={{ color: 'var(--ink-400)' }}>{t('assembly.study.notCorrected')}</span>
                      )}
                      {adjustable && (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                          <Input
                            inputMode="decimal"
                            style={{ width: 80 }}
                            placeholder={t('assembly.study.adjustPlaceholder', { max: fmtPts(q.points, lang) })}
                            value={draft}
                            onChange={(e) => setDrafts((m) => ({ ...m, [q.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!draftOk || adjustM.isPending}
                            onClick={() => draftPts != null && adjustM.mutate({ questionId: q.id, points: draftPts })}
                          >
                            {t('assembly.study.adjust')}
                          </Button>
                        </span>
                      )}
                    </div>
                  )}
                  {reviewable && q.type === 'OUVERTE' && given && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
                      <span style={{ color: 'var(--ink-500)' }}>{t('assembly.study.reviewLabel')}</span>
                      {VERDICTS.map((v) => (
                        <Button
                          key={v}
                          size="sm"
                          variant={a?.verdict === v ? 'primary' : 'secondary'}
                          disabled={adjustM.isPending || a?.verdict === v}
                          onClick={() => adjustM.mutate({ questionId: q.id, verdict: v })}
                        >
                          {t(`assembly.study.verdict.${v}`)}
                        </Button>
                      ))}
                    </div>
                  )}
                  {adjustable && isGraded(q) && draft.trim() !== '' && !draftOk && (
                    <span style={{ color: 'var(--err)', fontSize: 12 }}>
                      {t('assembly.study.pointsInvalid', { max: fmtPts(q.points, lang) })}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
//  ACCUEIL DE L'ÉTUDE — séance en cours, « À rattraper », Commencer (port de
//  `mobile/app/study/index.tsx`). D-ETU-14 levée (JP 27/10, décision n°3 — D-WEB-02) : le web
//  pilote les séances et y répond. Pour chaque assemblée où `/study/me` dit `participant` ou
//  `leader` (droits DU SERVEUR, D-ETU-06/07) :
//   - carte « Séance en cours » (*Répondre* / *Corriger* / *Reprendre*) → page de séance ;
//   - « À rattraper » (`catchUps`, D-ETU-44/45) → page de séance en mode rattrapage ;
//   - DIRIGEANT : unités du catalogue `?unitId=` (verrou D-ETU-19, leçons faites RG-ETU-17b), leçons
//     faites / commencées (plages des séances TERMINEE, D-ETU-38/42) / à faire, aperçu « questions
//     X à Y » (D-ETU-49), *Commencer* / *Continuer* / *Refaire*. *Commencer* ouvre « À lire avant la
//     leçon » (D-ETU-35) avec le choix du départ (D-ETU-39/49) ; une séance oubliée qui bloque
//     (STUDY_SESSION_ALREADY_OPEN) est proposée à *Terminer* (D-ETU-22).
// ---------------------------------------------------------------------------------------------

/** D-ETU-35 (JP 23/10) — ce que le dirigeant lit avant *Commencer*. */
type Briefing = {
  unitId: string;
  lesson: StudyLesson;
  /** Seulement à la première séance de l'unité dans l'assemblée. */
  unitNotes: string | null;
  lessonNotes: string | null;
  memberActions: string[];
  /** D-ETU-39 (JP 23/10) : plages des séances terminées de cette leçon (« questions 1 à 20 »). */
  pastRanges: string[];
  /** D-ETU-39 : première question de la plus ancienne séance de la leçon (« Reprendre au début »). */
  beginning: string | null;
  /** D-ETU-42 : leçon faite dans l'assemblée — le défaut du serveur repart alors du début. */
  lessonDone: boolean;
};

type StartChoice = 'default' | 'beginning' | 'custom';

/** D-ETU-49 (JP 23/10) — numéros de premier niveau de la leçon (vide : backend antérieur à ETU11b). */
function lessonNumbersOf(lesson: StudyLesson): string[] {
  return (lesson.topLevelNumbers ?? []).filter((n) => !!n);
}

/** D-ETU-49 — départ par défaut : `nextQuestionNumber` du serveur, sinon la première question ; null sans numéros. */
function defaultStartOf(lesson: StudyLesson): string | null {
  const numbers = lessonNumbersOf(lesson);
  if (numbers.length === 0) return null;
  const next = lesson.nextQuestionNumber;
  return next && numbers.includes(next) ? next : numbers[0];
}

/** D-ETU-49 — « questions 21 à 57 » à partir de `start`, ou « toute la leçon » au début. */
function previewRangeOf(lesson: StudyLesson, start: string | null, t: TFn): string | null {
  const numbers = lessonNumbersOf(lesson);
  if (numbers.length === 0 || !start) return null;
  return start === numbers[0]
    ? t('assembly.study.home.wholeLesson')
    : t('assembly.study.home.rangeShort', { first: start, last: numbers[numbers.length - 1] });
}

/** D-ETU-39 — séances TERMINEE d'une leçon dans l'assemblée, plus récentes d'abord (§4.7). */
function pastOfLesson(sessions: StudySessionSummary[], chapterId: string): StudySessionSummary[] {
  return sessions.filter((s) => s.status === 'TERMINEE' && s.chapterId === chapterId);
}

/** D-ETU-38 — « questions 1 à 20 » d'une séance, si le serveur porte ses bornes. */
function shortRange(s: { firstQuestionNumber?: string | null; lastQuestionNumber?: string | null }, t: TFn): string | null {
  return s.firstQuestionNumber && s.lastQuestionNumber
    ? t('assembly.study.home.rangeShort', { first: s.firstQuestionNumber, last: s.lastQuestionNumber })
    : null;
}

/** Plages des séances passées, de la plus ancienne à la plus récente, sans doublon. */
function rangesOf(past: StudySessionSummary[], t: TFn): string[] {
  const out: string[] = [];
  for (const s of [...past].reverse()) {
    const r = shortRange(s, t);
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

const blankToNull = (text: string | null | undefined): string | null => (text && text.trim() ? text : null);

/** « Leçon 3 — Titre ». */
function lessonTitleOf(t: TFn, n: number, title: string | null | undefined): string {
  return [t('assembly.study.lesson', { n }), title].filter(Boolean).join(' — ');
}

/** Les assemblées où l'appelant répond ou pilote (`/study/me`) : un bloc chacune, en tête de page. */
function StudyHome({ assemblies }: { assemblies: StudyAssembly[] }) {
  const mine = assemblies.filter((a) => a.participant || a.leader);
  if (mine.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginBottom: 30 }}>
      {mine.map((a) => (
        <StudyAssemblyHome key={a.unitId} assembly={a} showName={mine.length > 1 || a.leader} />
      ))}
    </div>
  );
}

function StudyAssemblyHome({ assembly, showName }: { assembly: StudyAssembly; showName: boolean }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const base = useStudyBase();
  const [unitOpen, setUnitOpen] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  // STUDY_SESSION_ALREADY_OPEN : la séance oubliée et la leçon à ouvrir ensuite (D-ETU-22).
  const [forgotten, setForgotten] = useState<{ current: StudySessionSummary; lesson: StudyLesson; start: string | null } | null>(null);

  const current = assembly.currentSession;
  const catchUps = assembly.catchUps ?? [];
  const leader = assembly.leader;

  // D-ETU-07 : le catalogue `?unitId=` (verrou, leçons faites, notes du dirigeant, D-ETU-49) et les
  // séances de l'assemblée (même clé que le tableau des séances : un seul appel).
  const catalogQ = useQuery({
    queryKey: ['assembly', 'study', 'catalog', assembly.unitId],
    queryFn: () => getStudyCatalog(assembly.unitId),
    enabled: leader,
  });
  const sessionsQ = useQuery({
    queryKey: ['assembly', 'study', 'sessions', assembly.unitId],
    queryFn: () => listStudySessions(assembly.unitId),
    enabled: leader,
  });
  const catalog = catalogQ.data ?? [];
  const sessions = sessionsQ.data ?? [];

  const openSession = (id: string) => navigate(`${base}/session/${id}`);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['assembly', 'study'] });

  const onStart = (u: StudyUnitForAssembly, lesson: StudyLesson) => {
    if (opening) return;
    const firstOfUnit = !u.unit.lessons.some((l) => u.doneChapterIds.includes(l.chapterId));
    const past = pastOfLesson(sessions, lesson.chapterId);
    // Sans rien à lire ni départ à choisir, la modale n'est qu'une confirmation (comme le mobile).
    setBriefing({
      unitId: assembly.unitId,
      lesson,
      unitNotes: firstOfUnit ? blankToNull(u.unit.leaderNotes) : null,
      lessonNotes: blankToNull(lesson.leaderNotes),
      memberActions: (lesson.memberActions ?? []).filter((a) => a && a.trim()),
      pastRanges: rangesOf(past, t),
      beginning: past.length > 0 ? past[past.length - 1].firstQuestionNumber || null : null,
      lessonDone: u.doneChapterIds.includes(lesson.chapterId),
    });
  };

  /** Ouverture ; sur STUDY_SESSION_ALREADY_OPEN, propose de *Terminer* l'oubliée (D-ETU-22). */
  const doStart = async (lesson: StudyLesson, start: string | null) => {
    if (opening) return;
    setOpening(lesson.chapterId);
    try {
      const created = await openStudySession(assembly.unitId, lesson.chapterId, start);
      qc.setQueryData(['assembly', 'study', 'session', created.session.id], created);
      invalidate();
      openSession(created.session.id);
    } catch (e) {
      if (errCode(e) !== 'STUDY_SESSION_ALREADY_OPEN') {
        push({ kind: 'error', title: t('assembly.study.title'), msg: studyErrMsg(e, t) });
        return;
      }
      try {
        // Contrat §4.3 : relire `/study/me` pour retrouver la séance qui bloque.
        const fresh = await qc.fetchQuery({ queryKey: ['assembly', 'study', 'me'], queryFn: getStudyMe, staleTime: 0 });
        const blocking = (fresh.assemblies ?? []).find((a) => a.unitId === assembly.unitId)?.currentSession;
        if (!blocking) push({ kind: 'error', title: t('assembly.study.title'), msg: studyErrMsg(e, t) });
        else setForgotten({ current: blocking, lesson, start });
      } catch (e2) {
        push({ kind: 'error', title: t('assembly.study.title'), msg: studyErrMsg(e2, t) });
      }
    } finally {
      setOpening(null);
    }
  };

  const finishAndStart = async () => {
    if (!forgotten || opening) return;
    const f = forgotten;
    setForgotten(null);
    setOpening(f.lesson.chapterId);
    try {
      await finishStudySession(f.current.id);
      const created = await openStudySession(assembly.unitId, f.lesson.chapterId, f.start);
      qc.setQueryData(['assembly', 'study', 'session', created.session.id], created);
      invalidate();
      openSession(created.session.id);
    } catch (e) {
      push({ kind: 'error', title: t('assembly.study.title'), msg: studyErrMsg(e, t) });
      invalidate();
    } finally {
      setOpening(null);
    }
  };

  const action = !current
    ? null
    : leader
      ? t('assembly.study.home.resume')
      : current.status === 'CORRECTION'
        ? t('assembly.study.home.correct')
        : t('assembly.study.home.answer');

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--line)',
    background: 'var(--ivory-card)',
  } as const;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {showName && <h3 style={{ ...sectionTitle, fontSize: 17 }}>{assembly.unitName}</h3>}

      {current ? (
        <div
          className="card"
          style={{ padding: '16px 18px', background: 'var(--green-800)', color: 'var(--ivory)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--earth-400)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--earth-500)' }} />
              {t('assembly.study.home.liveTitle')} · {t(`assembly.study.status.${current.status}`)}
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, marginTop: 6 }}>
              {lessonTitleOf(t, current.lessonNumber, current.lessonTitle)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {[current.moduleCode, current.moduleName, shortRange(current, t)].filter(Boolean).join(' · ')}
              <StudyLangBadges languages={[current.moduleLanguage]} reference={assembly.language} />
            </div>
          </div>
          <Button variant="primary" iconR={<Icon name="chevRight" size={14} />} onClick={() => openSession(current.id)}>
            {action}
          </Button>
        </div>
      ) : !leader && catchUps.length === 0 ? (
        <div className="card" style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Icon name="calendar" size={20} />
          <div>
            <div style={{ fontWeight: 600 }}>{t('assembly.study.home.noCurrent')}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>{t('assembly.study.home.noCurrentHint')}</div>
          </div>
        </div>
      ) : null}

      {catchUps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('assembly.study.home.catchUpTitle')}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>{t('assembly.study.home.catchUpHint')}</div>
          </div>
          {catchUps.map((c: StudyCatchUp) => (
            <div key={c.sessionId} style={rowStyle}>
              <Icon name="history" size={18} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{lessonTitleOf(t, c.lessonNumber, c.lessonTitle)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                  {[c.moduleCode ?? c.moduleName, shortRange(c, t), t('assembly.study.home.finishedOn', { date: fmtInstant(c.finishedAt) })]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Button size="sm" variant="primary" onClick={() => openSession(c.sessionId)}>
                {c.started ? t('assembly.study.home.catchUpContinue') : t('assembly.study.home.catchUpStart')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {leader && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {current ? t('assembly.study.home.startOther') : t('assembly.study.home.startSession')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>{t('assembly.study.home.startSub')}</div>
          </div>
          {catalogQ.isLoading || sessionsQ.isLoading ? (
            <p style={{ color: 'var(--ink-500)', margin: 0 }}>{t('common.loading')}</p>
          ) : catalogQ.isError ? (
            <p style={{ color: 'var(--err)', margin: 0, fontSize: 13 }}>{studyErrMsg(catalogQ.error, t)}</p>
          ) : catalog.length === 0 ? (
            <p style={{ color: 'var(--ink-500)', margin: 0, fontSize: 13 }}>{t('assembly.study.home.noCatalog')}</p>
          ) : (
            catalog.map((u) => {
              const open = unitOpen === u.unit.moduleId;
              const done = u.unit.lessons.filter((l) => u.doneChapterIds.includes(l.chapterId)).length;
              return (
                <div key={u.unit.moduleId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setUnitOpen(open ? null : u.unit.moduleId)}
                    style={{ ...rowStyle, width: '100%', textAlign: 'left', cursor: 'pointer', color: 'var(--ink-900)' }}
                  >
                    <span style={{ color: u.locked ? 'var(--ink-400)' : 'var(--green-700)', display: 'inline-flex' }}>
                      <Icon name={u.locked ? 'lock' : 'folder'} size={18} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontWeight: 500 }}>
                        {[u.unit.code, u.unit.name].filter(Boolean).join(' · ')}
                        {/* D-ETU-26 : version de l'autre langue, proposée faute de mieux — jamais bloquée. */}
                        <StudyLangBadges languages={[u.unit.language]} reference={assembly.language} />
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-500)' }}>
                        {u.locked
                          ? t('assembly.study.home.locked')
                          : t('assembly.study.home.lessonsDone', { done, total: u.unit.lessons.length })}
                      </span>
                    </span>
                    <Icon name="chevDown" size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
                  </button>
                  {open && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 18 }}>
                      {u.unit.bookTitle && (
                        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink-500)' }}>{u.unit.bookTitle}</div>
                      )}
                      {u.unit.lessons.map((l) => {
                        const isDone = u.doneChapterIds.includes(l.chapterId);
                        // D-ETU-38/42 : leçon commencée, pas encore entièrement couverte.
                        const covered = isDone ? [] : rangesOf(pastOfLesson(sessions, l.chapterId), t);
                        // D-ETU-49 : suite de la leçon (« questions 21 à 57 ») avant *Commencer*.
                        const nextStart = isDone ? null : defaultStartOf(l);
                        const resumeAt = nextStart && nextStart !== lessonNumbersOf(l)[0] ? nextStart : null;
                        const started = covered.length > 0 || !!resumeAt;
                        return (
                          <div key={l.chapterId} style={{ ...rowStyle, opacity: u.locked ? 0.55 : 1 }}>
                            <span style={{ color: isDone || started ? 'var(--green-700)' : 'var(--ink-400)', display: 'inline-flex' }}>
                              <Icon name={isDone ? 'check' : started ? 'history' : 'arrowRight'} size={16} />
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500 }}>{lessonTitleOf(t, l.number, l.title)}</div>
                              {l.portion && <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{l.portion}</div>}
                              {covered.length > 0 && (
                                <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                                  {t('assembly.study.home.covered', { ranges: covered.join(' · ') })}
                                </div>
                              )}
                              {resumeAt && (
                                <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                                  {t('assembly.study.home.nextRange', { range: previewRangeOf(l, resumeAt, t) })}
                                </div>
                              )}
                            </div>
                            <Badge tone={isDone ? 'ok' : started ? 'earth' : 'gray'}>
                              {isDone
                                ? t('assembly.study.home.lessonDone')
                                : started
                                  ? t('assembly.study.home.lessonStarted')
                                  : t('assembly.study.home.lessonToDo')}
                            </Badge>
                            <Button
                              size="sm"
                              variant={isDone ? 'secondary' : 'primary'}
                              disabled={u.locked || !!opening}
                              onClick={() => onStart(u, l)}
                            >
                              {opening === l.chapterId
                                ? t('common.loading')
                                : isDone
                                  ? t('assembly.study.home.redo')
                                  : started
                                    ? t('assembly.study.home.continue')
                                    : t('assembly.study.home.start')}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {briefing && (
        <BriefingModal
          briefing={briefing}
          onClose={() => setBriefing(null)}
          onConfirm={(start) => {
            const b = briefing;
            setBriefing(null);
            void doStart(b.lesson, start);
          }}
        />
      )}
      {forgotten && (
        <Modal
          open
          onClose={() => setForgotten(null)}
          title={t('assembly.study.home.forgottenTitle')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setForgotten(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={() => void finishAndStart()}>{t('assembly.study.home.finishAndStart')}</Button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {t('assembly.study.home.forgottenBody', {
              lesson: lessonTitleOf(t, forgotten.current.lessonNumber, forgotten.current.lessonTitle),
            })}
          </p>
        </Modal>
      )}
    </section>
  );
}

/**
 * D-ETU-35 (JP 23/10) : « À lire avant la leçon » — recommandations de l'unité, puis de la leçon,
 * puis l'aperçu des actions des membres (texte brut, D-ETU-37) ; *Commencer* ouvre la séance.
 * D-ETU-49 (JP 23/10) : avec `topLevelNumbers`, aperçu « questions X à Y » et choix de la question de
 * départ (défaut `nextQuestionNumber`) — la question affichée part TOUJOURS en `startQuestionNumber`.
 * Repli sans ces champs (D-ETU-39) : « à la suite » (défaut du serveur, rien d'envoyé) / « reprendre
 * au début » / numéro libre, pour une leçon déjà commencée. Sans rien de tout cela : simple
 * confirmation.
 */
function BriefingModal({
  briefing,
  onClose,
  onConfirm,
}: {
  briefing: Briefing;
  onClose: () => void;
  onConfirm: (startQuestionNumber: string | null) => void;
}) {
  const { t } = useTranslation();
  const label = lessonTitleOf(t, briefing.lesson.number, briefing.lesson.title);
  const numbers = lessonNumbersOf(briefing.lesson);
  const defaultStart = defaultStartOf(briefing.lesson);
  const [picked, setPicked] = useState<string | null>(defaultStart);
  const [choice, setChoice] = useState<StartChoice>('default');
  const [custom, setCustom] = useState('');
  const resumed = briefing.pastRanges.length > 0;
  // Leçon faite : le défaut du serveur repart déjà du début — « Reprendre au début » ferait doublon.
  const showBeginning = resumed && !briefing.lessonDone && !!briefing.beginning;
  const preview = numbers.length > 0;
  const hasReading = !!briefing.unitNotes || !!briefing.lessonNotes || briefing.memberActions.length > 0;
  const start = preview
    ? picked
    : choice === 'beginning'
      ? briefing.beginning
      : choice === 'custom'
        ? custom.trim() || null
        : null;
  const ready = preview ? !!picked : choice !== 'custom' || !!custom.trim();
  const choices: { key: StartChoice; label: string }[] = [
    { key: 'default', label: briefing.lessonDone ? t('assembly.study.start.defaultRedo') : t('assembly.study.start.default') },
    ...(showBeginning ? [{ key: 'beginning' as const, label: t('assembly.study.start.beginning', { number: briefing.beginning }) }] : []),
    { key: 'custom', label: t('assembly.study.start.custom') },
  ];
  const chip = (selected: boolean, isDefault: boolean) =>
    ({
      minWidth: 40,
      padding: '5px 10px',
      borderRadius: 99,
      border: `1px solid ${selected ? 'var(--green-700)' : isDefault ? 'var(--green-500)' : 'var(--line)'}`,
      background: selected ? 'var(--green-700)' : 'var(--ivory)',
      color: selected ? 'var(--ivory-raised)' : 'var(--ink-800)',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      cursor: 'pointer',
    }) as const;
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={hasReading ? t('assembly.study.briefing.title') : t('assembly.study.start.title')}
      sub={label}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!ready} onClick={() => onConfirm(start)}>
            {t('assembly.study.home.start')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <StudyNotesText title={t('assembly.study.briefing.unitNotes')} text={briefing.unitNotes} />
        <StudyNotesText title={t('assembly.study.briefing.lessonNotes')} text={briefing.lessonNotes} />
        <StudyMemberActions title={t('assembly.study.briefing.memberActions')} actions={briefing.memberActions} />
        {preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{t('assembly.study.start.pick')}</strong>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--green-700)' }}>
              {t('assembly.study.start.sessionRange', { range: previewRangeOf(briefing.lesson, picked, t) })}
            </span>
            {resumed && (
              <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                {t('assembly.study.home.covered', { ranges: briefing.pastRanges.join(' · ') })}
              </span>
            )}
            <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
              {defaultStart && defaultStart !== numbers[0]
                ? t('assembly.study.start.pickNext', { number: defaultStart })
                : t('assembly.study.start.pickFirst')}
            </span>
            <div role="radiogroup" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {numbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === picked}
                  aria-label={t('assembly.study.answer.number', { number: n })}
                  onClick={() => setPicked(n)}
                  style={chip(n === picked, n === defaultStart)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
        {!preview && resumed && (
          <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{t('assembly.study.start.from')}</strong>
            <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
              {t('assembly.study.home.covered', { ranges: briefing.pastRanges.join(' · ') })}
            </span>
            {choices.map((c) => (
              <label key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
                <input type="radio" name="study-start" checked={choice === c.key} onChange={() => setChoice(c.key)} />
                {c.label}
              </label>
            ))}
            {choice === 'custom' && (
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={t('assembly.study.start.customPlaceholder')}
                autoComplete="off"
                style={{ maxWidth: 260 }}
              />
            )}
          </div>
        )}
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>{t('assembly.study.start.confirm', { lesson: label })}</p>
      </div>
    </Modal>
  );
}
