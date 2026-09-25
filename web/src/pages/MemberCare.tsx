import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Picker,
  Select,
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { getAccessibleModules } from '../services/authApi';
import {
  changeStatus,
  getOverview,
  getRecord,
  listRecords,
  listStatuses,
  listUnits,
  sendReminder,
  updateNote,
  type MemberCareRecord,
  type MemberCareStatus,
  type OverviewRow,
} from '../services/memberCareApi';
import { formatMeetingDate } from '../utils/meetingReport';

// ---------------------------------------------------------------------------------------------
//  Suivi pastoral — refonte du 23/09 (§6.2 du plan « Vie d'assemblée & refonte Member Care », Lot L7).
//  D-ASM-02 (JP 23/09) : la liste = les comptes MEMBRE de l'assemblée, sans aucune action du
//  dirigeant ; plus de « Ajouter une personne », plus d'édition d'identité ni de suppression.
//  D-ASM-04 (JP 23/09) : le sélecteur ne propose que les assemblées renvoyées par
//  GET /member-care/units (dirigeant de l'assemblée + chaîne de ses superviseurs, pas la géographie).
//  D-ASM-05 (JP 23/09) : écriture (statut, note) seulement si le serveur renvoie `canEdit` — jamais
//  recalculé ici ; le superviseur et le superAdmin sont en lecture seule.
//  D-ASM-09 (JP 23/09) : l'onglet Redevabilité reste tel quel (gelé).
// ---------------------------------------------------------------------------------------------

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

function StatusPill({ label, color }: { label: string | null; color: string | null }) {
  const { t } = useTranslation();
  if (!label) return <span style={{ color: 'var(--ink-400)' }}>{t('memberCare.noStatus')}</span>;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12,
      background: (color ?? '#999') + '22', color: color ?? 'var(--ink-700)', border: `1px solid ${color ?? '#ccc'}`,
    }}>{label}</span>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** LocalDate « yyyy-MM-dd » → « dd/MM/yyyy » sans passer par `Date` (pas de décalage de fuseau). */
const fmtDay = (iso: string | null) => (iso ? formatMeetingDate(iso) : '—');

function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name="inbox" size={26} />
      </div>
      <h4>{title}</h4>
      {text && <p>{text}</p>}
    </div>
  );
}

export function MemberCarePage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const [tab, setTab] = useState<'suivi' | 'redevabilite'>('suivi');
  const [unitId, setUnitId] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [search, setSearch] = useState('');
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  // RG-06 : sans abonnement MEMBER_CARE, message plutôt qu'une cascade de 403. La présence
  // d'ASSEMBLY décide de la colonne « Dernière présence » (D-ASM-12 : dépendance à sens unique).
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const moduleCodes = modulesQ.data ?? [];
  const hasMemberCare = moduleCodes.includes('MEMBER_CARE');
  const hasAssembly = moduleCodes.includes('ASSEMBLY');

  const statusesQ = useQuery({ queryKey: ['mc-statuses'], queryFn: listStatuses, enabled: hasMemberCare });
  const unitsQ = useQuery({ queryKey: ['mc-units'], queryFn: listUnits, enabled: hasMemberCare });
  const overviewQ = useQuery({
    queryKey: ['mc-overview'],
    queryFn: getOverview,
    enabled: hasMemberCare && tab === 'redevabilite',
  });
  const units = useMemo(() => unitsQ.data ?? [], [unitsQ.data]);
  const statuses = statusesQ.data ?? [];

  // Assemblée par défaut : la première renvoyée (le serveur trie celles où j'écris en tête).
  useEffect(() => {
    if (units.length > 0 && !units.some((u) => u.id === unitId)) setUnitId(units[0].id);
  }, [units, unitId]);
  const unit = units.find((u) => u.id === unitId) ?? null;

  const recordsQ = useQuery({
    queryKey: ['mc-records', unitId, fStatus, search],
    queryFn: () => listRecords({ unitId, statusId: fStatus || undefined, search: search.trim() || undefined }),
    enabled: hasMemberCare && !!unitId,
  });

  const reminderM = useMutation({
    mutationFn: (id: string) => sendReminder(id),
    onSuccess: () => push({ kind: 'ok', title: t('memberCare.reminderSent'), msg: '' }),
    onError: (e: unknown) => push({ kind: 'error', title: t('memberCare.reminderFailed'), msg: errMsg(e, t('common.error')) }),
  });

  const recordCols: Column<MemberCareRecord & { id: string }>[] = [
    {
      label: t('memberCare.colName'),
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.fullName}</div>
          {r.username && r.username !== r.fullName && (
            <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{r.username}</div>
          )}
        </div>
      ),
    },
    { label: t('memberCare.colStatus'), render: (r) => <StatusPill label={r.currentStatusLabel} color={r.currentStatusColor} /> },
    { label: t('memberCare.colPhone'), render: (r) => <span>{r.phoneNumber ?? '—'}</span> },
    { label: t('memberCare.colEmail'), render: (r) => <span>{r.email ?? '—'}</span> },
    ...(hasAssembly
      ? [{
          label: t('memberCare.colLastAttendance'),
          render: (r: MemberCareRecord) => <span style={{ color: 'var(--ink-500)' }}>{fmtDay(r.lastAttendanceDate)}</span>,
        }]
      : []),
    { label: t('memberCare.colUpdated'), render: (r) => <span style={{ color: 'var(--ink-500)' }}>{fmt(r.updatedAt)}</span> },
  ];

  const overviewCols: Column<OverviewRow & { id: string }>[] = [
    { label: t('memberCare.colUnit'), render: (r) => <span style={{ fontWeight: 500 }}>{r.unitName}</span> },
    { label: t('memberCare.colRecords'), render: (r) => <span>{r.recordCount}</span> },
    { label: t('memberCare.colLastUpdate'), render: (r) => <span style={{ color: 'var(--ink-500)' }}>{fmt(r.lastUpdatedAt)}</span> },
    {
      label: t('memberCare.colState'),
      render: (r) => r.recordCount === 0
        ? <Badge tone="gray">{t('memberCare.stateEmpty')}</Badge>
        : r.late ? <Badge tone="err">{t('memberCare.stateLate')}</Badge> : <Badge tone="ok">{t('memberCare.stateUpToDate')}</Badge>,
    },
    {
      label: '',
      render: (r) => r.late ? (
        <Button variant="ghost" onClick={() => reminderM.mutate(r.unitId)} disabled={reminderM.isPending}>{t('memberCare.relaunch')}</Button>
      ) : null,
    },
  ];

  const body = (() => {
    if (modulesQ.isLoading || (hasMemberCare && unitsQ.isLoading)) {
      return <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
    }
    if (!hasMemberCare) {
      return <EmptyState title={t('memberCare.moduleOff')} text={t('memberCare.moduleOffHint')} />;
    }
    if (units.length === 0 || !unit) {
      return <EmptyState title={t('memberCare.noUnitInScope')} text={t('memberCare.noUnitHint')} />;
    }
    return (
      <>
        <div className="filters" style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {units.length > 1 && (
            <Field label={t('memberCare.filterUnit')} style={{ minWidth: 260 }}>
              <Picker
                value={unitId}
                onChange={setUnitId}
                options={units.map((u) => ({ id: u.id, label: u.name, sub: u.cityName ?? undefined }))}
                placeholder={t('memberCare.chooseUnit')}
              />
            </Field>
          )}
          <Field label={t('memberCare.filterStatus')}>
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label={t('memberCare.filterSearch')}>
            <Input placeholder={t('memberCare.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>{unit.name}</strong>
          {unit.cityName && <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>{unit.cityName}</span>}
          {!unit.canEdit && <Badge tone="gray">{t('memberCare.readOnly')}</Badge>}
        </div>
        {recordsQ.isLoading ? (
          <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
        ) : (
          <Table
            columns={recordCols}
            rows={(recordsQ.data ?? []).map((r) => ({ ...r, id: r.userId }))}
            zebra
            onRowClick={(r) => setOpenUserId(r.userId)}
            empty={(fStatus || search.trim())
              ? undefined
              : <EmptyState title={t('memberCare.noMember')} text={t('memberCare.noMemberHint')} />}
          />
        )}
      </>
    );
  })();

  return (
    <>
      <TopBar title={t('memberCare.title')} crumbs={[t('common.brand'), t('memberCare.title')]} />
      <div className="content">
        {hasMemberCare && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Button variant={tab === 'suivi' ? 'primary' : 'ghost'} onClick={() => setTab('suivi')}>{t('memberCare.tabFollowUp')}</Button>
            <Button variant={tab === 'redevabilite' ? 'primary' : 'ghost'} onClick={() => setTab('redevabilite')}>{t('memberCare.tabAccountability')}</Button>
          </div>
        )}

        {tab === 'suivi' || !hasMemberCare ? body : (
          <Table columns={overviewCols} rows={(overviewQ.data ?? []).map((r) => ({ ...r, id: r.unitId }))} zebra
            empty={<div className="empty" style={{ padding: 24 }}>{t('memberCare.noUnitInScope')}</div>} />
        )}
      </div>

      {openUserId && (
        <RecordModal
          key={openUserId}
          userId={openUserId}
          statuses={statuses}
          onClose={() => setOpenUserId(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Fiche : statut + historique + note + présences (RG-MCR-10, si ASSEMBLY est actif).
//  Identité et contact viennent du compte (D-ASM-01) : affichés, jamais éditables ici.
// ---------------------------------------------------------------------------------------------

function RecordModal({ userId, statuses, onClose }: {
  userId: string;
  statuses: MemberCareStatus[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const qc = useQueryClient();
  const [newStatusId, setNewStatusId] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const detailQ = useQuery({ queryKey: ['mc-record', userId], queryFn: () => getRecord(userId) });
  const detail = detailQ.data;
  const record = detail?.record;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['mc-records'] });
    qc.invalidateQueries({ queryKey: ['mc-record', userId] });
    qc.invalidateQueries({ queryKey: ['mc-overview'] });
  };

  const statusM = useMutation({
    mutationFn: () => changeStatus(userId, { statusId: newStatusId, note: statusNote.trim() || undefined }),
    onSuccess: () => {
      refresh();
      setNewStatusId('');
      setStatusNote('');
      push({ kind: 'ok', title: t('memberCare.statusUpdated'), msg: '' });
    },
    onError: (e: unknown) => push({ kind: 'error', title: t('memberCare.failed'), msg: errMsg(e, t('common.error')) }),
  });

  const noteM = useMutation({
    // Note vide = effacement (UpdateNoteRequest : null ou vide efface).
    mutationFn: () => updateNote(userId, noteDraft.trim() || null),
    onSuccess: () => {
      refresh();
      setEditingNote(false);
      push({ kind: 'ok', title: t('memberCare.noteSaved'), msg: '' });
    },
    onError: (e: unknown) => push({ kind: 'error', title: t('memberCare.failed'), msg: errMsg(e, t('common.error')) }),
  });

  const section = { borderTop: '1px solid var(--line,#eee)', paddingTop: 12 } as const;
  const history = detail ? [...detail.history].reverse() : [];

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={record ? record.fullName : t('memberCare.recordTitle')}
      sub={record ? <StatusPill label={record.currentStatusLabel} color={record.currentStatusColor} /> : undefined}
      footer={<Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}
    >
      {detailQ.isError ? (
        <div style={{ color: 'var(--ink-500)' }}>{errMsg(detailQ.error, t('common.error'))}</div>
      ) : !detail || !record ? (
        <div style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Identité (lecture seule, issue du compte) */}
          <div style={{ fontSize: 14, color: 'var(--ink-600)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {record.unitName && <div>{t('memberCare.assemblyLabel')} : <strong>{record.unitName}</strong></div>}
            {record.username && <div>{t('memberCare.usernameLabel')} : {record.username}</div>}
            {record.phoneNumber && <div>{t('memberCare.phoneLabel')} : {record.phoneNumber}</div>}
            {record.email && <div>{t('memberCare.emailLabel')} : {record.email}</div>}
            {!record.canEdit && (
              <div style={{ marginTop: 6 }}><Badge tone="gray">{t('memberCare.readOnly')}</Badge></div>
            )}
          </div>

          {/* Changement de statut — RG-MCR-08 v2 */}
          {record.canEdit && (
            <div style={section}>
              <strong style={{ fontSize: 13 }}>{t('memberCare.changeStatus')}</strong>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <Select value={newStatusId} onChange={(e) => setNewStatusId(e.target.value)}>
                  <option value="">{t('memberCare.statusOption')}</option>
                  {statuses.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
                <Input placeholder={t('memberCare.notePlaceholder')} value={statusNote} maxLength={500}
                  onChange={(e) => setStatusNote(e.target.value)} />
                <Button variant="primary" onClick={() => statusM.mutate()} disabled={!newStatusId || statusM.isPending}>
                  {t('common.ok')}
                </Button>
              </div>
            </div>
          )}

          {/* Note */}
          <div style={section}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>{t('memberCare.note')}</strong>
              {record.canEdit && !editingNote && (
                <Button variant="ghost" onClick={() => { setNoteDraft(record.note ?? ''); setEditingNote(true); }}>
                  {record.note ? t('common.edit') : t('memberCare.addNote')}
                </Button>
              )}
            </div>
            {editingNote ? (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="input"
                  rows={4}
                  maxLength={1000}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button variant="ghost" onClick={() => setEditingNote(false)}>{t('common.cancel')}</Button>
                  <Button variant="primary" onClick={() => noteM.mutate()} disabled={noteM.isPending}>
                    {noteM.isPending ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: 14, whiteSpace: 'pre-wrap', color: record.note ? 'var(--ink-700)' : 'var(--ink-400)' }}>
                {record.note || t('memberCare.noNote')}
              </div>
            )}
          </div>

          {/* Historique des statuts (RG-MCR-06), le plus récent en tête */}
          <div style={section}>
            <strong style={{ fontSize: 13 }}>{t('memberCare.journey')}</strong>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.length === 0 && <span style={{ color: 'var(--ink-400)' }}>{t('memberCare.noChange')}</span>}
              {history.map((h) => (
                <div key={h.id} style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-500)' }}>{fmt(h.changedAt)}</span>{' — '}
                  {h.oldStatusLabel ? `${h.oldStatusLabel} → ` : ''}<strong>{h.newStatusLabel}</strong>
                  {h.changedByName ? <span style={{ color: 'var(--ink-500)' }}> · {t('memberCare.changedBy', { name: h.changedByName })}</span> : null}
                  {h.note ? <span style={{ color: 'var(--ink-500)' }}> · {h.note}</span> : null}
                </div>
              ))}
            </div>
          </div>

          {/* Présences — RG-MCR-10 / D-ASM-08 : section masquée sans ASSEMBLY (D-ASM-12) */}
          {detail.attendanceEnabled && (
            <div style={section}>
              <strong style={{ fontSize: 13 }}>{t('memberCare.attendances')}</strong>
              <div style={{ fontSize: 13, color: 'var(--ink-600)', marginTop: 6 }}>
                {t('memberCare.lastAttendance')} : <strong>{fmtDay(record.lastAttendanceDate ?? detail.attendances[0]?.meetingDate ?? null)}</strong>
                {' · '}
                {t('memberCare.attendanceCount', { n: detail.attendances.length })}
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {detail.attendances.length === 0 && <span style={{ color: 'var(--ink-400)', fontSize: 13 }}>{t('memberCare.noAttendance')}</span>}
                {detail.attendances.map((a) => (
                  <div key={a.meetingId} style={{ fontSize: 13 }}>
                    <span>{fmtDay(a.meetingDate)}</span>
                    {a.unitName && <span style={{ color: 'var(--ink-500)' }}> · {a.unitName}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
