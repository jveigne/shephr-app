import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import {
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  StatusBadge,
  Table,
  Toggle,
  TopBar,
  UnitTypeBadge,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { canManageStructure } from '../services/authApi';
import {
  createUnit,
  deleteUnit,
  listLocalities,
  listUnits,
  updateUnit,
  type LocalityResponse,
  type UnitResponse,
  type UnitType,
} from '../services/adminApi';
import { ConfirmDelete } from './Zones';

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function UnitesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const ministryId = me?.ministryId ?? null;
  const canWrite = canManageStructure(me);

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UnitResponse | null>(null);
  const [toDelete, setToDelete] = useState<UnitResponse | null>(null);

  const localitiesQ = useQuery({ queryKey: ['admin', 'localities'], queryFn: () => listLocalities() });
  const unitsQ = useQuery({ queryKey: ['admin', 'units'], queryFn: () => listUnits() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'units'] });

  const createM = useMutation({
    mutationFn: createUnit,
    onSuccess: () => { invalidate(); setCreating(false); push({ kind: 'ok', title: t('units.created') }); },
    onError: (err) => push({ kind: 'error', title: t('units.createRefused'), msg: errMsg(err, t('units.createFailed')) }),
  });
  const updateM = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; localityId?: string; type?: UnitType; active?: boolean }) =>
      updateUnit(id, payload),
    onSuccess: () => { invalidate(); setEditing(null); push({ kind: 'ok', title: t('units.updated') }); },
    onError: (err) => push({ kind: 'error', title: t('units.updateRefused'), msg: errMsg(err, t('units.updateFailed')) }),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteUnit(id),
    onSuccess: () => { invalidate(); setToDelete(null); push({ kind: 'ok', title: t('units.deleted') }); },
    onError: (err) => push({ kind: 'error', title: t('units.deleteRefused'), msg: errMsg(err, t('units.deleteFailed')) }),
  });

  const rows = useMemo(() => {
    const all = unitsQ.data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((u) => `${u.name} ${u.localityName} ${u.joinCode}`.toLowerCase().includes(q));
  }, [unitsQ.data, search]);

  const localities = localitiesQ.data ?? [];
  const canCreate = canWrite && localities.length > 0 && ministryId != null;

  const cols: Column<UnitResponse>[] = [
    { label: t('units.colUnit'), render: (u) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{u.name}</span> },
    { label: t('units.colType'), render: (u) => <UnitTypeBadge type={u.type} /> },
    { label: t('common.locality'), render: (u) => u.localityName },
    {
      label: t('units.colCode'),
      render: (u) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-600)' }}>{u.joinCode}</span>,
    },
    { label: t('common.status'), render: (u) => <StatusBadge active={u.active} /> },
    ...(canWrite
      ? [{
          label: '',
          style: { width: 90 },
          render: (u: UnitResponse) => (
            <div className="row-actions">
              <IconButton icon={<Icon name="edit" size={15} />} title={t('common.edit')} onClick={() => setEditing(u)} />
              <IconButton icon={<Icon name="trash" size={15} />} danger title={t('common.delete')} onClick={() => setToDelete(u)} />
            </div>
          ),
        } as Column<UnitResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title={t('units.title')}
        crumbs={[t('common.brand'), t('nav.structure'), t('units.title')]}
        actions={
          <Button
            variant="primary"
            iconL={<Icon name="plus" size={15} />}
            disabled={!canCreate}
            title={canCreate ? undefined : t('units.noLocalityHint')}
            onClick={() => setCreating(true)}
          >
            {t('units.newUnit')}
          </Button>
        }
      />

      <div className="content">
        <p className="section-sub">{t('units.intro')}</p>

        <div className="filters">
          <Field label={t('common.searchLabel')} style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder={t('units.searchPlaceholder')}
              icon={<Icon name="search" size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          {t('units.count', { count: rows.length })}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<UnitResponse>
            columns={cols}
            rows={rows}
            zebra
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icon name="unit" size={26} /></div>
                <h4>{t('units.noUnit')}</h4>
                <p>{canCreate ? t('units.createFirst') : t('units.noneInScope')}</p>
              </div>
            }
          />
        </div>
      </div>

      <UnitFormModal
        open={creating}
        onClose={() => setCreating(false)}
        localities={localities}
        submitting={createM.isPending}
        onSubmit={(v) =>
          ministryId && createM.mutate({ ministryId, localityId: v.localityId, name: v.name, type: v.type })
        }
      />
      <UnitFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        localities={localities}
        unit={editing ?? undefined}
        submitting={updateM.isPending}
        onSubmit={(v) => editing && updateM.mutate({ id: editing.id, name: v.name, localityId: v.localityId, type: v.type, active: v.active })}
      />
      <ConfirmDelete
        open={toDelete != null}
        label={toDelete ? t('units.deleteLabel', { name: toDelete.name }) : ''}
        submitting={deleteM.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
      />
    </>
  );
}

function UnitFormModal({
  open,
  onClose,
  localities,
  unit,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  localities: LocalityResponse[];
  unit?: UnitResponse;
  submitting: boolean;
  onSubmit: (v: { localityId: string; name: string; type: UnitType; active: boolean }) => void;
}) {
  const { t } = useTranslation();
  const isEdit = unit != null;
  const [localityId, setLocalityId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<UnitType>('CENTER');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setLocalityId(unit?.localityId ?? localities[0]?.id ?? '');
      setName(unit?.name ?? '');
      setType(unit?.type ?? 'CENTER');
      setActive(unit?.active ?? true);
    }
  }, [open, unit, localities]);

  const valid = name.trim().length > 0 && localityId !== '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('units.editTitle') : t('units.newTitle')}
      sub={isEdit ? undefined : t('units.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!valid || submitting}
            onClick={() => onSubmit({ localityId, name: name.trim(), type, active })}
          >
            {submitting ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label={t('common.locality')}>
          <Select value={localityId} onChange={(e) => setLocalityId(e.target.value)}>
            {localities.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.zoneName ? ` — ${l.zoneName}` : ''}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('units.nameLabel')}>
          <Input placeholder={t('units.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('units.colType')}>
          <Select value={type} onChange={(e) => setType(e.target.value as UnitType)}>
            <option value="CENTER">{t('units.typeCenter')}</option>
            <option value="ASSEMBLY">{t('units.typeAssembly')}</option>
          </Select>
        </Field>
        {isEdit && (
          <Field label={t('common.status')}>
            <Toggle checked={active} onChange={setActive} label={active ? t('common.activeFem') : t('common.inactiveFem')} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
