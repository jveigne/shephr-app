import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Checkbox,
  Field,
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
import { getAccessibleModules } from '../services/authApi';
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
  listTeachingModules,
  updateMeeting,
  type AssemblyUnit,
  type Chapter,
  type MeetingSummary,
  type ModuleProgress,
  type Part,
  type TeachingModule,
  type UnitProgress,
} from '../services/assemblyApi';
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
  const [tab, setTab] = useState<'meetings' | 'progress'>('meetings');
  const [unitId, setUnitId] = useState('');
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
          <button className={`tab ${tab === 'meetings' ? 'active' : ''}`} onClick={() => setTab('meetings')}>
            <Icon name="calendar" size={15} />
            {t('assembly.tabMeetings')}
          </button>
          <button className={`tab ${tab === 'progress' ? 'active' : ''}`} onClick={() => setTab('progress')}>
            <Icon name="sparkle" size={15} />
            {t('assembly.tabProgress')}
          </button>
        </div>
        {tab === 'meetings' ? (
          <MeetingsTab unit={unit} onOpen={setEditing} />
        ) : (
          <ProgressTab unit={unit} showOverview={units.length > 1} />
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
          unit?.canWrite && tab === 'meetings' ? (
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
