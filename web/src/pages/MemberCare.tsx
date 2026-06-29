import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import {
  changeStatus,
  createRecord,
  getOverview,
  getRecord,
  listRecords,
  listStatuses,
  sendReminder,
  type MemberCareRecord,
  type OverviewRow,
} from '../services/memberCareApi';

function StatusPill({ label, color }: { label: string | null; color: string | null }) {
  if (!label) return <span style={{ color: 'var(--ink-400)' }}>—</span>;
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

const EMPTY = { unitId: '', firstName: '', lastName: '', contactPhone: '', contactEmail: '', statusId: '', note: '' };

export function MemberCarePage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { me } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'suivi' | 'redevabilite'>('suivi');
  const [fUnit, setFUnit] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [newStatusId, setNewStatusId] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const statusesQ = useQuery({ queryKey: ['mc-statuses'], queryFn: listStatuses });
  const overviewQ = useQuery({ queryKey: ['mc-overview'], queryFn: getOverview });
  const recordsQ = useQuery({
    queryKey: ['mc-records', fUnit, fStatus, search],
    queryFn: () => listRecords({ unitId: fUnit || undefined, statusId: fStatus || undefined, search: search || undefined }),
  });
  const detailQ = useQuery({
    queryKey: ['mc-record', openRecordId],
    queryFn: () => getRecord(openRecordId as string),
    enabled: !!openRecordId,
  });

  const units = overviewQ.data ?? [];
  const statuses = statusesQ.data ?? [];

  // Unité par défaut à la création : l'unité « home » du dirigeant (donation ou goals) si elle est
  // dans son périmètre, sinon l'unique unité visible. Un dirigeant d'unité n'a ainsi rien à choisir.
  const ownUnitId = me?.donationUnitId ?? me?.goalUnitId ?? null;
  const defaultUnitId =
    (ownUnitId && units.some((u) => u.unitId === ownUnitId) ? ownUnitId : '') ||
    (units.length === 1 ? units[0].unitId : '');

  const openCreate = () => {
    setForm({ ...EMPTY, unitId: defaultUnitId });
    setCreateOpen(true);
  };

  // Filet de sécurité : si le périmètre (overview) arrive après l'ouverture du modal, pré-remplir l'unité.
  useEffect(() => {
    if (createOpen && !form.unitId && defaultUnitId) {
      setForm((f) => ({ ...f, unitId: defaultUnitId }));
    }
  }, [createOpen, defaultUnitId, form.unitId]);

  const createM = useMutation({
    mutationFn: () => createRecord({
      unitId: form.unitId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      contactPhone: form.contactPhone || undefined,
      contactEmail: form.contactEmail || undefined,
      statusId: form.statusId || undefined,
      note: form.note || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mc-records'] });
      qc.invalidateQueries({ queryKey: ['mc-overview'] });
      setCreateOpen(false);
      setForm(EMPTY);
      push({ kind: 'ok', title: t('memberCare.recordCreated'), msg: '' });
    },
    onError: (e: unknown) => push({ kind: 'error', title: t('memberCare.failed'), msg: e instanceof Error ? e.message : t('common.error') }),
  });

  const statusM = useMutation({
    mutationFn: () => changeStatus(openRecordId as string, { statusId: newStatusId, note: statusNote || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mc-records'] });
      qc.invalidateQueries({ queryKey: ['mc-record', openRecordId] });
      qc.invalidateQueries({ queryKey: ['mc-overview'] });
      setNewStatusId('');
      setStatusNote('');
      push({ kind: 'ok', title: t('memberCare.statusUpdated'), msg: '' });
    },
    onError: (e: unknown) => push({ kind: 'error', title: t('memberCare.failed'), msg: e instanceof Error ? e.message : t('common.error') }),
  });

  const reminderM = useMutation({
    mutationFn: (unitId: string) => sendReminder(unitId),
    onSuccess: () => push({ kind: 'ok', title: t('memberCare.reminderSent'), msg: '' }),
    onError: (e: unknown) => push({ kind: 'error', title: t('memberCare.reminderFailed'), msg: e instanceof Error ? e.message : t('common.error') }),
  });

  const recordCols: Column<MemberCareRecord>[] = [
    { label: t('memberCare.colName'), render: (r) => <span style={{ fontWeight: 500 }}>{r.firstName} {r.lastName}</span> },
    { label: t('memberCare.colStatus'), render: (r) => <StatusPill label={r.currentStatusLabel} color={r.currentStatusColor} /> },
    { label: t('memberCare.colPhone'), render: (r) => <span>{r.contactPhone ?? '—'}</span> },
    { label: t('memberCare.colEmail'), render: (r) => <span>{r.contactEmail ?? '—'}</span> },
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

  const detail = detailQ.data;

  return (
    <>
      <TopBar
        title={t('memberCare.title')}
        crumbs={[t('common.brand'), t('memberCare.title')]}
        actions={tab === 'suivi' ? (
          <Button variant="primary" onClick={openCreate}>{t('memberCare.addPerson')}</Button>
        ) : undefined}
      />
      <div className="content">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Button variant={tab === 'suivi' ? 'primary' : 'ghost'} onClick={() => setTab('suivi')}>{t('memberCare.tabFollowUp')}</Button>
          <Button variant={tab === 'redevabilite' ? 'primary' : 'ghost'} onClick={() => setTab('redevabilite')}>{t('memberCare.tabAccountability')}</Button>
        </div>

        {tab === 'suivi' ? (
          <>
            <div className="filters" style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <Field label={t('memberCare.filterUnit')}>
                <Select value={fUnit} onChange={(e) => setFUnit(e.target.value)}>
                  <option value="">{t('common.allFem')}</option>
                  {units.map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}
                </Select>
              </Field>
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
            <Table columns={recordCols} rows={recordsQ.data ?? []} zebra onRowClick={(r) => { setOpenRecordId(r.id); setNewStatusId(''); }} />
          </>
        ) : (
          <Table columns={overviewCols} rows={(overviewQ.data ?? []).map((r) => ({ ...r, id: r.unitId }))} zebra
            empty={<div className="empty" style={{ padding: 24 }}>{t('memberCare.noUnitInScope')}</div>} />
        )}
      </div>

      {/* Création de fiche */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('memberCare.addPersonTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => createM.mutate()}
              disabled={!form.unitId || !form.firstName.trim() || !form.lastName.trim() || createM.isPending}>
              {createM.isPending ? t('memberCare.creating') : t('memberCare.createRecord')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {units.length === 0 && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, fontSize: 13, lineHeight: 1.45,
              background: 'rgba(184,106,74,0.10)', color: 'var(--ink-700)',
              border: '1px solid rgba(184,106,74,0.30)',
            }}>
              {t('memberCare.noUnitAttached')}
            </div>
          )}
          <Field label={t('memberCare.filterUnit')}>
            <Select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
              <option value="">{t('memberCare.chooseOption')}</option>
              {units.map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}
            </Select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={t('memberCare.firstName')}><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
            <Field label={t('memberCare.lastName')}><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={t('memberCare.phone')}><Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></Field>
            <Field label={t('memberCare.email')}><Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></Field>
          </div>
          <Field label={t('memberCare.initialStatus')}>
            <Select value={form.statusId} onChange={(e) => setForm({ ...form, statusId: e.target.value })}>
              <option value="">{t('memberCare.noneOption')}</option>
              {statuses.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label={t('memberCare.note')}><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Détail fiche + timeline */}
      <Modal
        open={!!openRecordId}
        onClose={() => setOpenRecordId(null)}
        title={detail ? `${detail.record.firstName} ${detail.record.lastName}` : t('memberCare.recordTitle')}
        sub={detail ? <StatusPill label={detail.record.currentStatusLabel} color={detail.record.currentStatusColor} /> : undefined}
        footer={<Button variant="ghost" onClick={() => setOpenRecordId(null)}>{t('common.close')}</Button>}
      >
        {!detail ? <div style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, color: 'var(--ink-600)' }}>
              {detail.record.contactPhone && <div>📞 {detail.record.contactPhone}</div>}
              {detail.record.contactEmail && <div>✉️ {detail.record.contactEmail}</div>}
              {detail.record.note && <div style={{ marginTop: 6 }}>{detail.record.note}</div>}
            </div>

            {detail.record.canEdit && (
              <div style={{ borderTop: '1px solid var(--line,#eee)', paddingTop: 12 }}>
                <strong style={{ fontSize: 13 }}>{t('memberCare.changeStatus')}</strong>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Select value={newStatusId} onChange={(e) => setNewStatusId(e.target.value)}>
                    <option value="">{t('memberCare.statusOption')}</option>
                    {statuses.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                  <Input placeholder={t('memberCare.notePlaceholder')} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                  <Button variant="primary" onClick={() => statusM.mutate()} disabled={!newStatusId || statusM.isPending}>{t('common.ok')}</Button>
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--line,#eee)', paddingTop: 12 }}>
              <strong style={{ fontSize: 13 }}>{t('memberCare.journey')}</strong>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.history.length === 0 && <span style={{ color: 'var(--ink-400)' }}>{t('memberCare.noChange')}</span>}
                {detail.history.map((h) => (
                  <div key={h.id} style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--ink-500)' }}>{fmt(h.changedAt)}</span>{' — '}
                    {h.oldStatusLabel ? `${h.oldStatusLabel} → ` : ''}<strong>{h.newStatusLabel}</strong>
                    {h.note ? <span style={{ color: 'var(--ink-500)' }}> · {h.note}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
