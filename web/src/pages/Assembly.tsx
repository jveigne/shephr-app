import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  Picker,
  Table,
  Toggle,
  TopBar,
  type Column,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { YearPicker } from '../components/YearPicker';
import { HierarchyLockedCompact, useCalebLockedAssemblies } from '../components/LockedFeature';
import { useAuth } from '../hooks/useAuth';
import { getAccessibleModules, hasMinistryAccess } from '../services/authApi';
import { hierarchyAccessDenied, type ModuleAccessDeniedDetails } from '../services/entitlementsApi';
import {
  createMeeting,
  deleteMeeting,
  getMeeting,
  getMyMeetings,
  getMyProgress,
  getRoster,
  getUnitProgress,
  listAssemblyUnits,
  listMeetings,
  listProgress,
  listStudySessions,
  listTeachingModules,
  updateMeeting,
  type AssemblyUnit,
  type Chapter,
  type MeetingDetail,
  type MeetingSummary,
  type ModuleProgress,
  type Part,
  type TeachingModule,
  type UnitProgress,
} from '../services/assemblyApi';
import { FEATURES } from '../config/features';
import { toLocalDate } from '../utils/format';
import { buildMeetingReport, formatChapters, formatMeetingDate, type Translate } from '../utils/meetingReport';
import {
  PERIODICITIES,
  buildJournalHtml,
  currentPeriod,
  isFuturePeriod,
  periodLabel,
  periodRange,
  shiftPeriod,
  type Period,
} from '../utils/assemblyJournal';
import { printHtml } from '../utils/printHtml';

/** Parties portées par des chapitres (module désactivé reconstitué à partir d'un CR), dans l'ordre. */
function partsOf(chapters: Chapter[]): Part[] {
  const byId = new Map<string, Part>();
  for (const c of [...chapters].sort((a, b) => a.orderIndex - b.orderIndex)) {
    if (c.partId && c.partNumber != null && !byId.has(c.partId)) {
      byId.set(c.partId, { id: c.partId, number: c.partNumber, title: c.partTitle, orderIndex: byId.size });
    }
  }
  return Array.from(byId.values());
}

// ---------------------------------------------------------------------------------------------
//  Vie d'assemblée (§6.2 du plan du 23/09, Lot L4) — réunions, compte rendu copiable, avancement.
//  D-ASM-12 (JP 23/09) : module d'abonnement ASSEMBLY, distinct de MEMBER_CARE.
//  RG-ASM-04 : seul le DIRIGEANT_UNITE de l'assemblée écrit (`canWrite` du serveur, jamais
//  recalculé ici). RG-ASM-05 : tout le périmètre visible lit CR et avancement.
//  D-ASM-17 (JP 25/09) : un MEMBRE (`unit.member`) lit son assemblée en lecture seule, avec sa
//  présence sur chaque réunion, « Mon avancement » et les CR suivis dans une assemblée quittée.
//  La page sert aussi l'espace membre (route /my-assembly sous MemberShell).
//  D-ETU-31 (JP 23/10, avenant ETU9) : l'onglet Étude a quitté cette page pour `pages/Study.tsx`
//  (« Le Message de Bertoua », module STUDY) — « une Vie d'assemblée, c'est le compte rendu ».
//  D-ETU-29 : le lien entre les deux modules est le catalogue partagé (chapitres lus du CR ↔ leçon
//  d'une séance) ; D-ETU-30 : suggestion du chapitre étudié dans le formulaire de CR (ci-dessous).
//  D-OFF-02 / P-02 (JP 27/10, plan 05 — ticket O2) : est gratuit tout ce qui touche UNE seule
//  assemblée, l'assemblée gratuite du compte (`unit.free`, choisie par le serveur). Toute autre
//  assemblée — lecture ET écriture — relève de l'offre Caleb (`HIERARCHIE_SUIVI`, chaîne de
//  supervision, jamais la géographie). `GET /units` ne renvoie donc que l'assemblée gratuite et, avec
//  Caleb, celles de la chaîne. Verrou Caleb COMPACT (`HierarchyLockedCompact`) à la place du contenu :
//  d'avance pour une assemblée que le compte dirige (`DIRIGEANT_UNITE`, `useCalebLockedAssemblies`)
//  mais que `/units` ne renvoie pas, et sur tout 403 `MODULE_ACCESS_DENIED` `HIERARCHIE_SUIVI` (droit expiré entre-temps) — jamais
//  un toast.
// ---------------------------------------------------------------------------------------------

/** D-OFF-02 (JP 27/10) : remonte un 403 `HIERARCHIE_SUIVI` d'une assemblée vers la page (verrou Caleb). */
type OnLocked = (unitId: string, denied: ModuleAccessDeniedDetails) => void;

/** Premier 403 `HIERARCHIE_SUIVI` parmi des erreurs de requêtes → `onLocked`, une fois par erreur. */
function useCalebLock(unitId: string, errors: unknown[], onLocked: OnLocked) {
  const denied = errors.map(hierarchyAccessDenied).find((d) => d != null) ?? null;
  useEffect(() => {
    if (denied) onLocked(unitId, denied);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `denied` change avec l'erreur reçue
  }, [denied?.moduleCode, unitId, onLocked]);
}

export const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;

export const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** Date locale du jour au format LocalDate « yyyy-MM-dd ». */
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fmtDate = (iso: string | null) => (iso ? formatMeetingDate(iso) : '—');

export function ProgressBar({ percent, height = 8 }: { percent: number; height?: number }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <div style={{ height, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${w}%`, height: '100%', borderRadius: 999, background: 'var(--green-700)' }} />
    </div>
  );
}

export function AssemblyPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const [tab, setTab] = useState<'meetings' | 'progress'>('meetings');
  // D-ASM-18 (JP 08/10) : `?unit=<id>` (lien depuis la Hiérarchie) présélectionne l'assemblée ;
  // un id hors de la liste visible retombe sur la sélection par défaut ci-dessous.
  const [searchParams] = useSearchParams();
  const [unitId, setUnitId] = useState(() => searchParams.get('unit') ?? '');
  /** `null` = fermé ; `'new'` = nouveau CR ; sinon id de la réunion ouverte. */
  const [editing, setEditing] = useState<string | null>(null);

  // RG-06 : sans abonnement ASSEMBLY, le module est invisible (le menu est déjà masqué) ;
  // une URL tapée à la main tombe sur un message plutôt que sur une cascade de 403.
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const hasAssembly = (modulesQ.data ?? []).includes('ASSEMBLY');
  // D-ETU-30 (JP 23/10) : ministère qui a AUSSI l'Étude → suggestion du chapitre étudié dans le CR.
  const hasStudy = FEATURES.study && (modulesQ.data ?? []).includes('STUDY');

  const unitsQ = useQuery({
    queryKey: ['assembly', 'units'],
    queryFn: listAssemblyUnits,
    enabled: hasAssembly,
  });
  const units = useMemo(() => unitsQ.data ?? [], [unitsQ.data]);

  // D-OFF-02 / P-02 (JP 27/10) : assemblées que le compte DIRIGE (`DIRIGEANT_UNITE` — `ledAssemblyIds`,
  // jamais un simple rattachement de `me.assemblies`, ni la `donationUnitId` d'un rôle Dons MEMBRE /
  // trésorier) mais que `/units` ne renvoie pas — sans Caleb, la seconde d'un dirigeant d'unité qui en
  // dirige deux. Proposées dans le sélecteur avec un cadenas ; les choisir montre le verrou Caleb
  // (jamais pour un simple membre, ni pour le superAdmin, ni si Caleb est déjà ouvert).
  const unitIds = useMemo(() => unitsQ.data?.map((u) => u.id), [unitsQ.data]);
  const lockedLed = useCalebLockedAssemblies(unitIds);
  /** 403 `HIERARCHIE_SUIVI` reçus par assemblée (droit Caleb expiré entre-temps). */
  const [serverLocked, setServerLocked] = useState<Record<string, ModuleAccessDeniedDetails>>({});
  const onLocked = useCallback<OnLocked>((id, denied) => {
    setEditing(null);
    setServerLocked((prev) => (prev[id] ? prev : { ...prev, [id]: denied }));
  }, []);

  // Assemblée par défaut : la première renvoyée (le serveur trie celles où j'écris en tête).
  useEffect(() => {
    if (units.some((u) => u.id === unitId) || lockedLed.some((a) => a.id === unitId)) return;
    if (units.length > 0) setUnitId(units[0].id);
    else if (lockedLed.length > 0) setUnitId(lockedLed[0].id);
  }, [units, lockedLed, unitId]);

  const unit = units.find((u) => u.id === unitId) ?? null;
  const lockedSel = unit ? null : lockedLed.find((a) => a.id === unitId) ?? null;
  const locked = lockedSel != null || (unit != null && serverLocked[unit.id] != null);

  const activeTab = tab;

  const body = (() => {
    if (modulesQ.isLoading || (hasAssembly && unitsQ.isLoading)) {
      return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    }
    if (!hasAssembly) {
      return <EmptyState title={t('assembly.moduleOff')} text={t('assembly.moduleOffHint')} />;
    }
    if (!unit && !lockedSel) {
      return (
        <>
          <EmptyState title={t('assembly.noUnit')} text={t('assembly.noUnitHint')} />
          {/* D-OFF-02 (JP 27/10) : un dirigeant sans assemblée gratuite (ville, région…) ne lit plus
              aucun CR par la géographie — les assemblées de sa chaîne relèvent de l'offre Caleb.
              Rien si le droit Caleb est déjà ouvert (chaîne vide). */}
          {me && !me.superAdmin && hasMinistryAccess(me) && (
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <HierarchyLockedCompact context="assembly" hideWhenEntitled />
            </div>
          )}
        </>
      );
    }
    const options = [
      ...units.map((u) => ({
        id: u.id,
        label: u.name,
        // D-OFF-02 : l'assemblée gratuite ou une assemblée de la chaîne (offre Caleb).
        sub: [u.cityName, u.free === false ? t('assembly.chainUnit') : t('assembly.freeUnit')].filter(Boolean).join(' · '),
      })),
      ...lockedLed.map((a) => ({
        id: a.id,
        label: a.name,
        sub: [a.cityName, t('assembly.lockedUnit')].filter(Boolean).join(' · '),
      })),
    ];
    return (
      <>
        {options.length > 1 && (
          <Field label={t('assembly.unit')} style={{ maxWidth: 360, marginBottom: 16 }}>
            <Picker
              value={unitId}
              onChange={setUnitId}
              options={options}
              placeholder={t('assembly.chooseUnit')}
            />
          </Field>
        )}
        {locked || !unit ? (
          <HierarchyLockedCompact context="assembly" canSubscribe={unit ? serverLocked[unit.id]?.canSubscribe : undefined} />
        ) : (
        <>
        <div className="tabs">
          <button className={`tab ${activeTab === 'meetings' ? 'active' : ''}`} onClick={() => setTab('meetings')}>
            <Icon name="calendar" size={15} />
            {t('assembly.tabMeetings')}
          </button>
          <button className={`tab ${activeTab === 'progress' ? 'active' : ''}`} onClick={() => setTab('progress')}>
            <Icon name="sparkle" size={15} />
            {t('assembly.tabProgress')}
          </button>
        </div>
        {activeTab === 'meetings' ? (
          <MeetingsTab unit={unit} onOpen={setEditing} onLocked={onLocked} />
        ) : (
          <ProgressTab unit={unit} showOverview={units.length > 1} onLocked={onLocked} />
        )}
        </>
        )}
      </>
    );
  })();

  return (
    <>
      <TopBar
        title={t('assembly.title')}
        crumbs={[t('common.brand'), t('assembly.title')]}
        actions={
          unit?.canWrite && !locked && activeTab === 'meetings' ? (
            <Button variant="primary" iconL={<Icon name="plus" size={14} />} onClick={() => setEditing('new')}>
              {t('assembly.newReport')}
            </Button>
          ) : undefined
        }
      />
      <div className="content">{body}</div>
      {unit && !locked && editing && (
        <MeetingEditor
          key={`${unit.id}-${editing}`}
          unit={unit}
          meetingId={editing === 'new' ? null : editing}
          hasStudy={hasStudy}
          onClose={() => setEditing(null)}
          onLocked={onLocked}
        />
      )}
    </>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name="inbox" size={26} />
      </div>
      <h4>{title}</h4>
      <p>{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  Réunions — liste par année (toutes les années chargées d'un coup, filtrées ici : c'est ce qui
//  donne la liste des années sans second appel).
// ---------------------------------------------------------------------------------------------

function MeetingsTab({ unit, onOpen, onLocked }: { unit: AssemblyUnit; onOpen: (id: string) => void; onLocked: OnLocked }) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const meetingsQ = useQuery({
    queryKey: ['assembly', 'meetings', unit.id],
    queryFn: () => listMeetings(unit.id),
  });
  const meetings = useMemo(() => meetingsQ.data ?? [], [meetingsQ.data]);
  useCalebLock(unit.id, [meetingsQ.error], onLocked);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const m of meetings) set.add(Number(m.meetingDate.slice(0, 4)));
    return Array.from(set).sort((a, b) => b - a);
  }, [meetings, currentYear]);

  const rows = meetings.filter((m) => m.meetingDate.startsWith(`${year}-`));
  const tr = t as unknown as Translate;
  // Journal PDF de l'assemblée (JP 08/10, D-ASM-14) — parité mobile → web (JP 27/10, décision
  // n°3 — D-WEB-01) : même règle que le mobile (`!isMember`), donc jamais pour le simple membre
  // qui lit son assemblée (/my-assembly, D-ASM-17).
  const [journalOpen, setJournalOpen] = useState(false);

  // D-ASM-17 : CR des réunions suivies dans une assemblée quittée depuis.
  const myMeetingsQ = useQuery({
    queryKey: ['assembly', 'my-meetings'],
    queryFn: getMyMeetings,
    enabled: unit.member,
  });
  const elsewhere = (myMeetingsQ.data ?? []).filter((m) => m.unitId !== unit.id);

  const presenceCol: Column<MeetingSummary> = {
    label: t('assembly.colMyPresence'),
    render: (m) =>
      m.attended ? <Badge tone="ok">{t('assembly.present')}</Badge> : <Badge tone="gray">{t('assembly.absent')}</Badge>,
  };
  const cols: Column<MeetingSummary>[] = [
    { label: t('assembly.colDate'), render: (m) => <span style={{ fontWeight: 500 }}>{fmtDate(m.meetingDate)}</span> },
    { label: t('assembly.colAttendees'), render: (m) => <span>{m.attendeeCount}</span> },
    {
      label: t('assembly.colBread'),
      render: (m) => (m.breadBreaking ? <Badge tone="ok">{t('common.yes')}</Badge> : <Badge tone="gray">{t('common.no')}</Badge>),
    },
    {
      label: t('assembly.colReading'),
      render: (m) =>
        m.chapters.length === 0 ? (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        ) : (
          <span>
            {m.moduleName ?? m.bookTitle}
            <span style={{ color: 'var(--ink-500)' }}> · {formatChapters(m.chapters, tr)}</span>
          </span>
        ),
    },
    ...(unit.member ? [presenceCol] : []),
    {
      label: '',
      style: { width: 40 },
      render: () => <Icon name="chevRight" size={14} />,
    },
  ];
  const elsewhereCols: Column<MeetingSummary>[] = [
    cols[0],
    { label: t('assembly.colUnit'), render: (m) => <span>{m.unitName ?? '—'}</span> },
    ...cols.slice(1).filter((c) => c !== presenceCol),
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <YearPicker years={years} value={year} onChange={setYear} />
        <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>
          {t('assembly.meetingCount', { count: rows.length })}
        </span>
        {!unit.member && (
          <Button
            size="sm"
            iconL={<Icon name="fileText" size={14} />}
            onClick={() => setJournalOpen(true)}
            style={{ marginLeft: 'auto' }}
          >
            {t('assembly.journal.open')}
          </Button>
        )}
      </div>
      {!unit.member && journalOpen && <UnitJournalModal unit={unit} onClose={() => setJournalOpen(false)} onLocked={onLocked} />}
      {meetingsQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : (
        <Table
          columns={cols}
          rows={rows}
          zebra
          onRowClick={(m) => onOpen(m.id)}
          empty={
            <EmptyState
              title={t('assembly.noMeeting')}
              text={unit.canWrite ? t('assembly.noMeetingWriter') : t('assembly.noMeetingReader')}
            />
          }
        />
      )}
      {elsewhere.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--green-800)', fontWeight: 500 }}>
            {t('assembly.otherMeetingsTitle')}
          </h3>
          <Table columns={elsewhereCols} rows={elsewhere} zebra onRowClick={(m) => onOpen(m.id)} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Journal PDF d'UNE assemblée (JP 08/10, D-ASM-14) — parité mobile → web (JP 27/10, décision
//  n°3 — D-WEB-01), pendant de `mobile/app/(tabs)/assembly/journal.tsx`.
//  Périodicité (mois / trimestre / semestre / année), période ‹ › sans période future, liste
//  nominative des présents FACULTATIVE (D-ASM-14 : le nombre reste toujours), puis « Générer » :
//  liste de l'année filtrée sur la période, détails par paquets de 4, HTML A4 imprimé via
//  utils/printHtml (« Enregistrer en PDF »). Lecture seule : mêmes données et mêmes gardes que la
//  liste des réunions (RG-ASM-05). Le journal consolidé de la Hiérarchie (D-ASM-18) reste sans noms.
// ---------------------------------------------------------------------------------------------

/** Détails chargés par paquets : un journal annuel compte ~50 réunions, inutile de tout lancer d'un coup. */
const JOURNAL_DETAIL_BATCH = 4;

async function loadMeetingDetails(ids: string[]): Promise<MeetingDetail[]> {
  const out: MeetingDetail[] = [];
  for (let i = 0; i < ids.length; i += JOURNAL_DETAIL_BATCH) {
    out.push(...(await Promise.all(ids.slice(i, i + JOURNAL_DETAIL_BATCH).map(getMeeting))));
  }
  return out;
}

function UnitJournalModal({ unit, onClose, onLocked }: { unit: AssemblyUnit; onClose: () => void; onLocked: OnLocked }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const tr = t as unknown as Translate;
  const [period, setPeriod] = useState<Period>(() => currentPeriod('month'));
  const [includeAttendees, setIncludeAttendees] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Une période tient toujours dans une année : la liste de l'année suffit, filtrée ici.
  const yearQ = useQuery({
    queryKey: ['assembly', 'meetings', unit.id, 'year', period.year],
    queryFn: () => listMeetings(unit.id, period.year),
  });
  useCalebLock(unit.id, [yearQ.error], onLocked);

  const inPeriod = useMemo(() => {
    const { from, to } = periodRange(period);
    return (yearQ.data ?? []).filter((m) => m.meetingDate >= from && m.meetingDate <= to);
  }, [yearQ.data, period]);

  const next = shiftPeriod(period, 1);
  const canGoNext = !isFuturePeriod(next);

  const generate = async () => {
    if (inPeriod.length === 0) return;
    setGenerating(true);
    try {
      const details = await loadMeetingDetails(inPeriod.map((m) => m.id));
      await printHtml(
        buildJournalHtml(
          {
            unitName: unit.name || details[0]?.unitName || '',
            cityName: unit.cityName,
            period,
            meetings: details,
            includeAttendees,
            generatedOn: toLocalDate(new Date()),
            locale: i18n.language,
          },
          tr,
        ),
      );
    } catch (err) {
      // D-OFF-02 (JP 27/10) : un 403 Caleb est un verrou, jamais un toast.
      const denied = hierarchyAccessDenied(err);
      if (denied) onLocked(unit.id, denied);
      else push({ kind: 'error', title: t('assembly.journal.failed'), msg: errMsg(err, '') || undefined });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('assembly.journal.unitTitle')}
      sub={unit.cityName ? `${unit.name} · ${unit.cityName}` : unit.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            variant="primary"
            iconL={<Icon name="download" size={14} />}
            disabled={generating || inPeriod.length === 0}
            onClick={generate}
          >
            {generating ? t('assembly.journal.generating') : t('assembly.journal.generate')}
          </Button>
        </>
      }
    >
      <Field label={t('assembly.journal.periodicity')}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PERIODICITIES.map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={period.kind === kind ? 'primary' : 'ghost'}
              onClick={() => period.kind !== kind && setPeriod(currentPeriod(kind))}
            >
              {t(`assembly.journal.kind.${kind}`)}
            </Button>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6 }}>
        <IconButton
          icon={<Icon name="chevLeft" size={14} />}
          aria-label={t('assembly.journal.previous')}
          title={t('assembly.journal.previous')}
          onClick={() => setPeriod(shiftPeriod(period, -1))}
        />
        <strong
          style={{
            minWidth: 170,
            textAlign: 'center',
            fontFamily: 'var(--font-serif)',
            fontWeight: 500,
            fontSize: 18,
            color: 'var(--ink-900)',
          }}
        >
          {capitalize(periodLabel(period, tr))}
        </strong>
        <IconButton
          icon={<Icon name="chevRight" size={14} />}
          aria-label={t('assembly.journal.next')}
          title={t('assembly.journal.next')}
          disabled={!canGoNext}
          onClick={() => canGoNext && setPeriod(next)}
        />
      </div>

      <p style={{ textAlign: 'center', margin: '12px 0 0', fontSize: 13.5, color: 'var(--ink-700)', minHeight: 20 }}>
        {yearQ.isLoading
          ? t('common.loading')
          : yearQ.isError
            ? errMsg(yearQ.error, t('assembly.journal.loadFailed'))
            : t('assembly.journal.unitReportCount', { count: inPeriod.length })}
      </p>

      <div className="card" style={{ padding: '12px 14px', marginTop: 16 }}>
        <Toggle
          checked={includeAttendees}
          onChange={setIncludeAttendees}
          label={t('assembly.journal.includeAttendees')}
        />
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.45 }}>
          {t('assembly.journal.includeAttendeesHint')}
        </p>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.5 }}>
        {t('assembly.journal.contentHint')}
      </p>
    </Modal>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------
//  Formulaire CR — présents cochables, fraction de pain, module + chapitres (déjà lus signalés),
//  aperçu du texte §5.4 en direct, option « inclure la liste des présents » (D-ASM-14), Copier.
//  Lecture seule (même rendu, sans saisie) quand le serveur ne donne pas `canWrite`.
// ---------------------------------------------------------------------------------------------

function MeetingEditor({
  unit,
  meetingId,
  hasStudy,
  onClose,
  onLocked,
}: {
  unit: AssemblyUnit;
  meetingId: string | null;
  /** Abonnement STUDY accessible : suggestion D-ETU-30 du chapitre étudié le jour du CR. */
  hasStudy: boolean;
  onClose: () => void;
  /** D-OFF-02 (JP 27/10) : 403 `HIERARCHIE_SUIVI` → la page ferme la modale et montre le verrou Caleb. */
  onLocked: OnLocked;
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const qc = useQueryClient();
  const isNew = meetingId == null;

  const detailQ = useQuery({
    queryKey: ['assembly', 'meeting', meetingId],
    queryFn: () => getMeeting(meetingId as string),
    enabled: !isNew,
  });
  const detail = detailQ.data ?? null;
  const readOnly = isNew ? !unit.canWrite : !(detail?.canWrite ?? false);

  const rosterQ = useQuery({
    queryKey: ['assembly', 'roster', unit.id],
    queryFn: () => getRoster(unit.id),
    enabled: !readOnly && (isNew || detail != null),
  });
  const modulesQ = useQuery({ queryKey: ['assembly', 'teaching-modules'], queryFn: listTeachingModules });
  const progressQ = useQuery({
    queryKey: ['assembly', 'progress', unit.id],
    queryFn: () => getUnitProgress(unit.id),
  });
  useCalebLock(unit.id, [detailQ.error, rosterQ.error, progressQ.error], onLocked);

  const [date, setDate] = useState(todayIso());
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [bread, setBread] = useState(false);
  const [moduleId, setModuleId] = useState('');
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [includeAttendees, setIncludeAttendees] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [initialized, setInitialized] = useState(isNew);

  // Réunion existante : on remplit le formulaire une seule fois, à l'arrivée du détail.
  useEffect(() => {
    if (initialized || !detail) return;
    setDate(detail.meetingDate);
    setAttendeeIds(detail.attendees.map((a) => a.userId));
    setBread(detail.breadBreaking);
    setModuleId(detail.moduleId ?? '');
    setChapterIds(detail.chapters.map((c) => c.id));
    setInitialized(true);
  }, [detail, initialized]);

  // Nouveau CR avec un seul module proposé : on le présélectionne.
  const activeModules = useMemo(() => modulesQ.data ?? [], [modulesQ.data]);
  useEffect(() => {
    if (isNew && !moduleId && activeModules.length === 1) setModuleId(activeModules[0].id);
  }, [isNew, moduleId, activeModules]);

  // D-ETU-30 (JP 23/10) — suggestion dans le CR : à la CRÉATION d'un CR de l'assemblée à la date D,
  // si une séance d'étude de l'assemblée a été ouverte le jour D (date locale), son chapitre est
  // pré-coché, modifiable — seulement si le dirigeant n'a encore rien coché. Les séances annulées
  // n'existent plus (DELETE, D-ETU-22). Toute erreur de l'appel = pas de suggestion. Le lien entre
  // les deux modules est le catalogue partagé (D-ETU-29) : un chapitre hors des modules actifs du
  // CR n'est pas suggéré.
  const meetingYear = Number(date.slice(0, 4)) || new Date().getFullYear();
  // Le serveur range une séance dans son année UTC : un 1er janvier / 31 décembre local peut tomber
  // dans l'année voisine, on la consulte aussi (le filtre par date locale ci-dessous tranche).
  const meetingYears = date.endsWith('-01-01')
    ? [meetingYear, meetingYear - 1]
    : date.endsWith('-12-31')
      ? [meetingYear, meetingYear + 1]
      : [meetingYear];
  const studySessionsQ = useQuery({
    queryKey: ['assembly', 'study', 'sessions', unit.id, ...meetingYears],
    queryFn: async () =>
      (await Promise.all(meetingYears.map((y) => listStudySessions(unit.id, y)))).flat(),
    enabled: isNew && hasStudy && !readOnly,
    retry: false,
  });
  /** Dernière suggestion posée (clé date + séance). */
  const [suggested, setSuggested] = useState<{ key: string; moduleId: string; chapterId: string } | null>(null);
  /** Le dirigeant a lui-même choisi module ou chapitres : plus aucune suggestion (comme le mobile). */
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!isNew || readOnly || touched || !studySessionsQ.data) return;
    const session = studySessionsQ.data.find(
      (s) =>
        toLocalDate(new Date(s.openedAt)) === date &&
        activeModules.some((m) => m.id === s.moduleId && m.chapters.some((c) => c.id === s.chapterId)),
    );
    // Suggestion intacte : elle suit le changement de date (remplacée, ou retirée sans séance ce jour).
    if (!session) {
      if (suggested) {
        setChapterIds([]);
        setSuggested(null);
      }
      return;
    }
    const key = `${date}:${session.id}`;
    if (suggested?.key === key) return;
    if (!suggested && chapterIds.length > 0) return;
    setModuleId(session.moduleId);
    setChapterIds([session.chapterId]);
    setSuggested({ key, moduleId: session.moduleId, chapterId: session.chapterId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relu à chaque date / séances, pas à chaque clic
  }, [date, studySessionsQ.data, activeModules, isNew, readOnly, touched]);
  const suggestionShown =
    suggested != null && moduleId === suggested.moduleId && chapterIds.includes(suggested.chapterId);

  // Modules proposés : les actifs (RG-ASM-02) ; un CR passé sur un module désactivé garde le sien,
  // reconstitué à partir des chapitres qu'il porte.
  const modules: TeachingModule[] = useMemo(() => {
    if (detail?.moduleId && !activeModules.some((m) => m.id === detail.moduleId)) {
      return [
        ...activeModules,
        {
          id: detail.moduleId,
          name: detail.moduleName ?? '',
          bookTitle: detail.bookTitle ?? '',
          orderIndex: Number.MAX_SAFE_INTEGER,
          parts: partsOf(detail.chapters),
          chapters: detail.chapters,
        },
      ];
    }
    return activeModules;
  }, [activeModules, detail]);
  const module = modules.find((m) => m.id === moduleId) ?? null;

  // Présents possibles : roster courant + présents déjà enregistrés qui l'auraient quitté depuis
  // (RG-ASM-07 : leur nom figé à la saisie est conservé). En lecture seule : les présents du CR.
  const people = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; leader: boolean }>();
    for (const a of detail?.attendees ?? []) byId.set(a.userId, { id: a.userId, name: a.displayName, leader: false });
    if (!readOnly) {
      for (const r of rosterQ.data ?? []) {
        const snap = byId.get(r.userId);
        byId.set(r.userId, { id: r.userId, name: snap?.name ?? r.fullName, leader: r.role === 'DIRIGEANT_UNITE' });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [detail, rosterQ.data, readOnly]);

  const readSet = useMemo(() => {
    const p = progressQ.data?.modules.find((m) => m.moduleId === moduleId);
    return new Set(p?.readChapterIds ?? []);
  }, [progressQ.data, moduleId]);

  const selectedChapters = (module?.chapters ?? []).filter((c) => chapterIds.includes(c.id));

  const reportText = buildMeetingReport(
    {
      meetingDate: date,
      unitName: detail?.unitName ?? unit.name,
      attendeeNames: people.filter((p) => attendeeIds.includes(p.id)).map((p) => p.name),
      breadBreaking: bread,
      bookTitle: module?.bookTitle ?? null,
      chapters: selectedChapters,
    },
    { includeAttendees },
    t as unknown as Translate,
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assembly', 'meetings', unit.id] });
    qc.invalidateQueries({ queryKey: ['assembly', 'progress'] });
    qc.invalidateQueries({ queryKey: ['assembly', 'progress-all'] });
    if (meetingId) qc.invalidateQueries({ queryKey: ['assembly', 'meeting', meetingId] });
  };

  const onError = (err: unknown) => {
    // D-OFF-02 (JP 27/10) : écrire dans une autre assemblée que la gratuite exige Caleb — verrou, pas de toast.
    const denied = hierarchyAccessDenied(err);
    if (denied) {
      onLocked(unit.id, denied);
      return;
    }
    const code = errCode(err);
    push({
      kind: 'error',
      title: t('assembly.saveFailed'),
      msg: code
        ? t(`assembly.errors.${code}`, { defaultValue: errMsg(err, t('common.error')) })
        : errMsg(err, t('common.error')),
    });
  };

  const saveM = useMutation({
    mutationFn: () => {
      const body = {
        meetingDate: date,
        breadBreaking: bread,
        attendeeIds,
        moduleId: selectedChapters.length > 0 ? moduleId || null : null,
        chapterIds: selectedChapters.map((c) => c.id),
      };
      return isNew ? createMeeting(unit.id, body) : updateMeeting(meetingId as string, body);
    },
    onSuccess: () => {
      invalidate();
      push({ kind: 'ok', title: isNew ? t('assembly.created') : t('assembly.updated') });
      onClose();
    },
    onError,
  });

  const deleteM = useMutation({
    mutationFn: () => deleteMeeting(meetingId as string),
    onSuccess: () => {
      invalidate();
      push({ kind: 'ok', title: t('assembly.deleted') });
      onClose();
    },
    onError: (err) => {
      const denied = hierarchyAccessDenied(err);
      if (denied) onLocked(unit.id, denied);
      else push({ kind: 'error', title: t('assembly.deleteFailed'), msg: errMsg(err, t('common.error')) });
    },
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      push({ kind: 'ok', title: t('assembly.copied') });
    } catch {
      push({ kind: 'error', title: t('assembly.copyFailed') });
    }
  };

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const loading = !isNew && !initialized;
  const allChecked = people.length > 0 && people.every((p) => attendeeIds.includes(p.id));

  const title = isNew
    ? t('assembly.newReport')
    : t('assembly.reportOf', { date: fmtDate(detail?.meetingDate ?? null) });

  return (
    <>
      <Modal
        open
        size="lg"
        onClose={onClose}
        title={title}
        sub={`${detail?.unitName ?? unit.name}${unit.cityName ? ` · ${unit.cityName}` : ''}`}
        footer={
          <>
            {!isNew && !readOnly && (
              <Button
                variant="danger"
                iconL={<Icon name="trash" size={14} />}
                onClick={() => setConfirmDelete(true)}
                style={{ marginRight: 'auto' }}
              >
                {t('common.delete')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {readOnly ? t('common.close') : t('common.cancel')}
            </Button>
            <Button variant="secondary" iconL={<Icon name="copy" size={14} />} onClick={copy} disabled={loading}>
              {t('assembly.copy')}
            </Button>
            {!readOnly && (
              <Button
                variant="primary"
                onClick={() => saveM.mutate()}
                disabled={loading || !date || saveM.isPending}
              >
                {saveM.isPending ? t('common.saving') : t('common.save')}
              </Button>
            )}
          </>
        }
      >
        {loading ? (
          <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {/* ---- Saisie ---- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {readOnly && <Badge tone="gray">{t('assembly.readOnly')}</Badge>}
              <Field label={t('assembly.date')}>
                <Input type="date" value={date} disabled={readOnly} onChange={(e) => setDate(e.target.value)} />
              </Field>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>
                    {t('assembly.attendees', { n: attendeeIds.length })}
                  </strong>
                  {!readOnly && people.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setAttendeeIds(allChecked ? [] : people.map((p) => p.id))}
                    >
                      {allChecked ? t('assembly.uncheckAll') : t('assembly.checkAll')}
                    </Button>
                  )}
                </div>
                {!readOnly && rosterQ.isLoading ? (
                  <p style={{ color: 'var(--ink-500)', margin: 0 }}>{t('common.loading')}</p>
                ) : people.length === 0 ? (
                  <p style={{ color: 'var(--ink-400)', margin: 0, fontSize: 13 }}>{t('assembly.noRoster')}</p>
                ) : readOnly ? (
                  <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{people.map((p) => p.name).join(', ')}</div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: 6,
                      maxHeight: 220,
                      overflowY: 'auto',
                    }}
                  >
                    {people.map((p) => (
                      <label
                        key={p.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}
                        onClick={(e) => {
                          // Le Checkbox maison gère son propre clic ; le libellé le relaie.
                          if ((e.target as HTMLElement).closest('.checkbox')) return;
                          setAttendeeIds((ids) => toggleId(ids, p.id));
                        }}
                      >
                        <Checkbox
                          checked={attendeeIds.includes(p.id)}
                          onChange={() => setAttendeeIds((ids) => toggleId(ids, p.id))}
                        />
                        <span>{p.name}</span>
                        {p.leader && <span style={{ color: 'var(--ink-400)', fontSize: 11.5 }}>{t('assembly.leaderTag')}</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle checked={bread} onChange={(v) => !readOnly && setBread(v)} label={t('assembly.breadBreaking')} />
              </div>

              <Field label={t('assembly.module')}>
                <Picker
                  value={moduleId}
                  disabled={readOnly}
                  onChange={(id) => {
                    setTouched(true);
                    // RG-ASM-03 : tous les chapitres d'une réunion viennent d'un seul module.
                    if (id !== moduleId) setChapterIds([]);
                    setModuleId(id);
                  }}
                  options={modules.map((m) => ({ id: m.id, label: m.name, sub: m.bookTitle }))}
                  placeholder={modules.length === 0 ? t('assembly.noModule') : t('assembly.chooseModule')}
                />
              </Field>

              {module && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13 }}>{t('assembly.chapters')}</strong>
                    <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>
                      <Icon name="check" size={11} /> {t('assembly.alreadyRead')}
                    </span>
                    {suggestionShown && !readOnly && (
                      <Badge tone="earth">{t('assembly.studySuggested')}</Badge>
                    )}
                  </div>
                  {/* JP 24/09 — module à parties : les chapitres (numérotés à partir de 1 dans
                      chaque partie) sont regroupés sous leur partie. */}
                  {(module.parts.length > 0
                    ? module.parts.map((part) => ({ part, chapters: module.chapters.filter((c) => c.partId === part.id) }))
                    : [{ part: null, chapters: module.chapters }]
                  ).map(({ part, chapters }) => (
                    <div key={part?.id ?? 'all'} style={{ marginBottom: part ? 10 : 0 }}>
                      {part && (
                        <div style={{ fontSize: 12.5, color: 'var(--ink-600)', fontWeight: 600, marginBottom: 4 }}>
                          {t('assembly.partHeading', { n: part.number })}
                          {part.title && <span style={{ fontWeight: 400, color: 'var(--ink-500)' }}> · {part.title}</span>}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {chapters.map((c) => {
                          const on = chapterIds.includes(c.id);
                          const read = readSet.has(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              disabled={readOnly}
                              title={[c.title, read ? t('assembly.alreadyRead') : null].filter(Boolean).join(' · ') || undefined}
                              onClick={() => {
                                setTouched(true);
                                setChapterIds((ids) => toggleId(ids, c.id));
                              }}
                              style={{
                                minWidth: 40,
                                padding: '5px 9px',
                                borderRadius: 8,
                                fontSize: 13,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4,
                                cursor: readOnly ? 'default' : 'pointer',
                                border: `1px solid ${on ? 'var(--green-700)' : 'var(--line)'}`,
                                background: on ? 'var(--green-700)' : 'transparent',
                                color: on ? 'var(--ivory)' : read ? 'var(--ink-500)' : 'var(--ink-800)',
                                fontWeight: on ? 600 : 500,
                              }}
                            >
                              {c.number}
                              {read && <Icon name="check" size={11} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ---- Aperçu du texte copiable (§5.4) ---- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: 13 }}>{t('assembly.preview')}</strong>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.checkbox')) return;
                  setIncludeAttendees((v) => !v);
                }}
              >
                <Checkbox checked={includeAttendees} onChange={setIncludeAttendees} />
                {t('assembly.includeAttendees')}
              </label>
              <pre
                style={{
                  margin: 0,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'var(--parchment)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--ink-800)',
                }}
              >
                {reportText}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('common.deleteTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => deleteM.mutate()} disabled={deleteM.isPending}>
              {deleteM.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t('assembly.deleteConfirm', { date: fmtDate(detail?.meetingDate ?? null) })}</p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Avancement (RG-ASM-08, D-ASM-11) — barres par module pour l'assemblée choisie ; pour qui voit
//  plusieurs assemblées (dirigeants au-dessus, LEADER / SECRETARIAT), tableau assemblée × module.
// ---------------------------------------------------------------------------------------------

function ModuleProgressCard({ p }: { p: ModuleProgress }) {
  const { t } = useTranslation();
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15.5, fontFamily: 'var(--font-serif)', color: 'var(--green-800)', fontWeight: 500 }}>
          {p.moduleName}
        </h3>
        {!p.active && <Badge tone="gray">{t('assembly.moduleInactive')}</Badge>}
        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{p.percent} %</span>
      </div>
      <div style={{ color: 'var(--ink-500)', fontSize: 12.5, margin: '2px 0 10px' }}>{p.bookTitle}</div>
      <ProgressBar percent={p.percent} />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink-500)', marginTop: 8 }}>
        <span>{t('assembly.readOf', { read: p.readCount, total: p.totalCount })}</span>
        {p.lastChapterNumber != null && (
          <span>
            {p.lastPartNumber != null
              ? t('assembly.lastChapterInPart', { part: p.lastPartNumber, n: p.lastChapterNumber, date: fmtDate(p.lastReadDate) })
              : t('assembly.lastChapter', { n: p.lastChapterNumber, date: fmtDate(p.lastReadDate) })}
          </span>
        )}
      </div>
    </div>
  );
}

function ProgressTab({ unit, showOverview, onLocked }: { unit: AssemblyUnit; showOverview: boolean; onLocked: OnLocked }) {
  const { t } = useTranslation();
  const [filterModuleId, setFilterModuleId] = useState('');

  const unitQ = useQuery({
    queryKey: ['assembly', 'progress', unit.id],
    queryFn: () => getUnitProgress(unit.id),
  });
  useCalebLock(unit.id, [unitQ.error], onLocked);
  const modulesQ = useQuery({ queryKey: ['assembly', 'teaching-modules'], queryFn: listTeachingModules });
  const allQ = useQuery({
    queryKey: ['assembly', 'progress-all', filterModuleId],
    queryFn: () => listProgress(filterModuleId || undefined),
    enabled: showOverview,
  });

  type Row = { id: string; unit: UnitProgress; p: ModuleProgress | null };
  const rows: Row[] = useMemo(
    () =>
      (allQ.data ?? []).flatMap((u): Row[] =>
        u.modules.length === 0
          ? [{ id: u.unitId, unit: u, p: null }]
          : u.modules.map((p) => ({ id: `${u.unitId}-${p.moduleId}`, unit: u, p })),
      ),
    [allQ.data],
  );

  const cols: Column<Row>[] = [
    {
      label: t('assembly.colUnit'),
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.unit.unitName}</div>
          {r.unit.cityName && <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>{r.unit.cityName}</div>}
        </div>
      ),
    },
    { label: t('assembly.colModule'), render: (r) => <span>{r.p?.moduleName ?? '—'}</span> },
    {
      label: t('assembly.colProgress'),
      style: { minWidth: 160 },
      render: (r) =>
        r.p ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}><ProgressBar percent={r.p.percent} height={6} /></div>
            <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
              {r.p.percent} % · {r.p.readCount}/{r.p.totalCount}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        ),
    },
    {
      label: t('assembly.colLastChapter'),
      render: (r) => (
        <span>
          {r.p?.lastChapterNumber == null
            ? '—'
            : r.p.lastPartNumber != null
              ? t('assembly.partChapterShort', { part: r.p.lastPartNumber, n: r.p.lastChapterNumber })
              : r.p.lastChapterNumber}
        </span>
      ),
    },
    {
      label: t('assembly.colLastMeeting'),
      render: (r) => <span style={{ color: 'var(--ink-500)' }}>{fmtDate(r.unit.lastMeetingDate)}</span>,
    },
  ];

  const unitModules = unitQ.data?.modules ?? [];

  // D-ASM-17 : « Mon avancement » — chapitres lus lors des réunions où le membre était présent.
  const mineQ = useQuery({
    queryKey: ['assembly', 'my-progress'],
    queryFn: getMyProgress,
    enabled: unit.member,
  });
  const mine = mineQ.data;

  return (
    <>
      {unit.member && (
        <div style={{ marginBottom: 28 }}>
          <div className="card-head" style={{ padding: 0, border: 'none', marginBottom: 12 }}>
            <div>
              <div className="ttl">{t('assembly.myProgress')}</div>
              <div className="sub">
                {!mine || mine.attendedCount === 0
                  ? t('assembly.myProgressEmpty')
                  : t('assembly.myProgressSub', { count: mine.attendedCount, date: fmtDate(mine.lastAttendedDate) })}
              </div>
            </div>
          </div>
          {mineQ.isLoading ? (
            <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
          ) : (
            mine &&
            mine.attendedCount > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {mine.modules.map((p) => <ModuleProgressCard key={p.moduleId} p={p} />)}
              </div>
            )
          )}
        </div>
      )}
      <div className="card-head" style={{ padding: 0, border: 'none', marginBottom: 12 }}>
        <div>
          <div className="ttl">{t('assembly.progressOf', { name: unit.name })}</div>
          <div className="sub">
            {t('assembly.lastMeeting', { date: fmtDate(unitQ.data?.lastMeetingDate ?? null) })}
          </div>
        </div>
      </div>
      {unitQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : unitModules.length === 0 ? (
        <EmptyState title={t('assembly.noModule')} text={t('assembly.noModuleHint')} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {unitModules.map((p) => <ModuleProgressCard key={p.moduleId} p={p} />)}
        </div>
      )}

      {showOverview && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--green-800)', fontWeight: 500 }}>
                {t('assembly.overview')}
              </h3>
              <div className="section-sub" style={{ margin: '2px 0 0' }}>{t('assembly.overviewSub')}</div>
            </div>
            <Field label={t('assembly.module')} style={{ marginLeft: 'auto', minWidth: 240 }}>
              <Picker
                value={filterModuleId || 'all'}
                onChange={(id) => setFilterModuleId(id === 'all' ? '' : id)}
                options={[
                  { id: 'all', label: t('assembly.allModules') },
                  ...(modulesQ.data ?? []).map((m) => ({ id: m.id, label: m.name, sub: m.bookTitle })),
                ]}
                placeholder={t('assembly.allModules')}
              />
            </Field>
          </div>
          {allQ.isLoading ? (
            <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
          ) : (
            <Table columns={cols} rows={rows} zebra />
          )}
        </div>
      )}
    </>
  );
}
