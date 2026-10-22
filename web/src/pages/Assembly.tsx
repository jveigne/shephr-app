import { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '../hooks/useAuth';
import { getAccessibleModules, type Language } from '../services/authApi';
import {
  adjustStudyAnswer,
  createMeeting,
  createPaperCopy,
  deleteMeeting,
  deletePaperCopy,
  getMeeting,
  getMyMeetings,
  getMemberStudyProgress,
  getMyProgress,
  getMyStudyProgress,
  getRoster,
  getStudyCatalog,
  getStudyCopy,
  getStudySessionResults,
  getStudyUnitProgress,
  getUnitProgress,
  listAssemblyUnits,
  listMeetings,
  listProgress,
  listStudyProgress,
  listStudySessions,
  listTeachingModules,
  updateMeeting,
  updatePaperCopy,
  type AssemblyUnit,
  type Chapter,
  type MeetingSummary,
  type ModuleProgress,
  type Part,
  type StudyAnswerView,
  type StudyCopyResult,
  type StudyPersonProgress,
  type StudyQuestionView,
  type StudySessionStatus,
  type StudySessionSummary,
  type StudyUnitForAssembly,
  type StudyUnitModuleProgress,
  type TeachingModule,
  type UnitProgress,
} from '../services/assemblyApi';
import { toLocalDate } from '../utils/format';
import { buildMeetingReport, formatChapters, formatMeetingDate, type Translate } from '../utils/meetingReport';

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
//  Étude de l'assemblée (plan du 21/10, §6.2) : troisième onglet, visible dès que le catalogue
//  `/study/catalog` n'est pas vide. D-ETU-14 (JP 21/10) : résultats, avancement, copie papier et
//  ajustement des points seulement — ni pilotage de séance ni réponse sur le web (mobile).
// ---------------------------------------------------------------------------------------------

const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** Date locale du jour au format LocalDate « yyyy-MM-dd ». */
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fmtDate = (iso: string | null) => (iso ? formatMeetingDate(iso) : '—');

function ProgressBar({ percent, height = 8 }: { percent: number; height?: number }) {
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
  const [tab, setTab] = useState<'meetings' | 'progress' | 'study'>('meetings');
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

  const unitsQ = useQuery({
    queryKey: ['assembly', 'units'],
    queryFn: listAssemblyUnits,
    enabled: hasAssembly,
  });
  const units = useMemo(() => unitsQ.data ?? [], [unitsQ.data]);

  // Assemblée par défaut : la première renvoyée (le serveur trie celles où j'écris en tête).
  useEffect(() => {
    if (units.length > 0 && !units.some((u) => u.id === unitId)) setUnitId(units[0].id);
  }, [units, unitId]);

  const unit = units.find((u) => u.id === unitId) ?? null;

  // §6.2 : l'onglet Étude n'existe que si une unité d'étude active a des questions. Un échec du
  // catalogue (ancien backend) le masque simplement, sans gêner Réunions / Avancement.
  const catalogQ = useQuery({
    queryKey: ['assembly', 'study', 'catalog'],
    queryFn: () => getStudyCatalog(),
    enabled: hasAssembly,
  });
  const catalog = useMemo(() => catalogQ.data ?? [], [catalogQ.data]);
  const activeTab = tab === 'study' && catalog.length === 0 ? 'meetings' : tab;

  const body = (() => {
    if (modulesQ.isLoading || (hasAssembly && unitsQ.isLoading)) {
      return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    }
    if (!hasAssembly) {
      return <EmptyState title={t('assembly.moduleOff')} text={t('assembly.moduleOffHint')} />;
    }
    if (units.length === 0 || !unit) {
      return <EmptyState title={t('assembly.noUnit')} text={t('assembly.noUnitHint')} />;
    }
    return (
      <>
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
        <div className="tabs">
          <button className={`tab ${activeTab === 'meetings' ? 'active' : ''}`} onClick={() => setTab('meetings')}>
            <Icon name="calendar" size={15} />
            {t('assembly.tabMeetings')}
          </button>
          <button className={`tab ${activeTab === 'progress' ? 'active' : ''}`} onClick={() => setTab('progress')}>
            <Icon name="sparkle" size={15} />
            {t('assembly.tabProgress')}
          </button>
          {catalog.length > 0 && (
            <button className={`tab ${activeTab === 'study' ? 'active' : ''}`} onClick={() => setTab('study')}>
              <Icon name="edit" size={15} />
              {t('assembly.study.tab')}
            </button>
          )}
        </div>
        {activeTab === 'meetings' ? (
          <MeetingsTab unit={unit} onOpen={setEditing} />
        ) : activeTab === 'progress' ? (
          <ProgressTab unit={unit} showOverview={units.length > 1} />
        ) : (
          <StudyTab
            key={unit.id}
            unit={unit}
            catalog={catalog}
            showOverview={units.length > 1}
            personal={unit.member || me?.goalUnitId === unit.id}
          />
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
          unit?.canWrite && activeTab === 'meetings' ? (
            <Button variant="primary" iconL={<Icon name="plus" size={14} />} onClick={() => setEditing('new')}>
              {t('assembly.newReport')}
            </Button>
          ) : undefined
        }
      />
      <div className="content">{body}</div>
      {unit && editing && (
        <MeetingEditor
          key={`${unit.id}-${editing}`}
          unit={unit}
          meetingId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
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

function MeetingsTab({ unit, onOpen }: { unit: AssemblyUnit; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const meetingsQ = useQuery({
    queryKey: ['assembly', 'meetings', unit.id],
    queryFn: () => listMeetings(unit.id),
  });
  const meetings = useMemo(() => meetingsQ.data ?? [], [meetingsQ.data]);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const m of meetings) set.add(Number(m.meetingDate.slice(0, 4)));
    return Array.from(set).sort((a, b) => b - a);
  }, [meetings, currentYear]);

  const rows = meetings.filter((m) => m.meetingDate.startsWith(`${year}-`));
  const tr = t as unknown as Translate;

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
      </div>
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
//  Formulaire CR — présents cochables, fraction de pain, module + chapitres (déjà lus signalés),
//  aperçu du texte §5.4 en direct, option « inclure la liste des présents » (D-ASM-14), Copier.
//  Lecture seule (même rendu, sans saisie) quand le serveur ne donne pas `canWrite`.
// ---------------------------------------------------------------------------------------------

function MeetingEditor({
  unit,
  meetingId,
  onClose,
}: {
  unit: AssemblyUnit;
  meetingId: string | null;
  onClose: () => void;
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
    onError: (err) =>
      push({ kind: 'error', title: t('assembly.deleteFailed'), msg: errMsg(err, t('common.error')) }),
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
                              onClick={() => setChapterIds((ids) => toggleId(ids, c.id))}
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

function ProgressTab({ unit, showOverview }: { unit: AssemblyUnit; showOverview: boolean }) {
  const { t } = useTranslation();
  const [filterModuleId, setFilterModuleId] = useState('');

  const unitQ = useQuery({
    queryKey: ['assembly', 'progress', unit.id],
    queryFn: () => getUnitProgress(unit.id),
  });
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

const studyErrMsg = (err: unknown, t: TFn): string => {
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
}: {
  unit: AssemblyUnit;
  catalog: StudyUnitForAssembly[];
  showOverview: boolean;
  /** Le compte est répondant de cette assemblée (D-ETU-06) : carte « Mon avancement ». */
  personal: boolean;
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

  const sessionsQ = useQuery({
    queryKey: ['assembly', 'study', 'sessions', unit.id],
    queryFn: () => listStudySessions(unit.id),
    enabled: readerView,
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
  });
  const leader = progressQ.data?.leader ?? false;

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
          {/* ---- Séances (pilotées depuis le mobile, D-ETU-14) ---- */}
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
              onRowClick={(s) => setResultsId(s.id)}
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
                    {l.bestSource === 'PAPIER' && <Badge tone="earth">{t('assembly.study.paper')}</Badge>}
                    <span style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {t('assembly.study.scoreOf', { score: fmtPts(l.bestScore, lang), max: fmtPts(l.maxScore, lang) })}
                    </span>
                    {/* Copie papier : note seule, rien à ouvrir. */}
                    {onOpenCopy && l.bestCopyId && l.bestSource === 'APP' && (
                      <Button size="sm" variant="ghost" onClick={() => onOpenCopy(l.bestCopyId as string)}>
                        {t('assembly.study.view')}
                      </Button>
                    )}
                  </>
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

function StudyResultsModal({
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
  const max = r?.session.maxScore ?? 0;

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
          {c.source === 'PAPIER' && <Badge tone="earth">{t('assembly.study.paper')}</Badge>}
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
        c.source === 'APP' ? (
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
                  <IconButton
                    icon={<Icon name="edit" size={14} />}
                    title={t('common.edit')}
                    onClick={() => {
                      setEditing(c);
                      setEditScore(String(c.score));
                    }}
                  />
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
            {leader && !adding && (
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
              <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>
                {t('assembly.study.maxScore', { max: fmtPts(r.session.maxScore, lang) })}
              </span>
            </div>
            {r.session.status !== 'TERMINEE' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-600)' }}>
                <Icon name="info" size={15} />
                <span>{t('assembly.study.resultsOpenHint')}</span>
              </div>
            )}

            {adding && (
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
              // RG-ETU-13 : seul le dirigeant ouvre une copie (APP ; une copie papier n'a que sa note).
              onRowClick={leader ? (c) => c.source === 'APP' && onOpenCopy(c.id) : undefined}
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

function StudyCopyModal({ copyId, canAdjust, onClose }: { copyId: string; canAdjust: boolean; onClose: () => void }) {
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
  const adjustable = canAdjust && d?.copy.source === 'APP';

  const answers = useMemo(() => new Map((d?.copy.answers ?? []).map((a) => [a.questionId, a])), [d]);
  const questions = useMemo(() => [...(d?.questions ?? [])].sort((a, b) => a.orderIndex - b.orderIndex), [d]);

  const adjustM = useMutation({
    mutationFn: (v: { questionId: string; points: number }) => adjustStudyAnswer(copyId, v.questionId, { points: v.points }),
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
            {d.copy.source === 'PAPIER' && <Badge tone="earth">{t('assembly.study.paper')}</Badge>}
            <StudyStatusBadge status={d.session.status} />
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
