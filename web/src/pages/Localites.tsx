import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { canManageLocalities, isSecretariat } from '../services/authApi';
import {
  createLocality,
  deleteLocality,
  listLocalities,
  listZones,
  updateLocality,
  type LocalityResponse,
  type ZoneResponse,
} from '../services/adminApi';
import { ConfirmDelete } from './Zones';

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function LocalitesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const ministryId = me?.ministryId ?? null;
  // Chantier B : la Ville se crée sous une Région (les teams sont dissoutes) — managers de structure.
  const canWrite = canManageLocalities(me);
  // RDG 25/07 : création/suppression directes réservées au SUPER_ADMIN et au SECRETARIAT.
  const secretariat = isSecretariat(me);
  const canDirect = (me?.superAdmin ?? false) || secretariat;
  const canDelete = canWrite || secretariat;

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LocalityResponse | null>(null);
  const [toDelete, setToDelete] = useState<LocalityResponse | null>(null);

  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones() });
  const localitiesQ = useQuery({ queryKey: ['admin', 'localities'], queryFn: () => listLocalities() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'localities'] });

  const createM = useMutation({
    mutationFn: createLocality,
    onSuccess: () => { invalidate(); setCreating(false); push({ kind: 'ok', title: t('localities.created') }); },
    onError: (err) => push({ kind: 'error', title: t('localities.createRefused'), msg: errMsg(err, t('localities.createFailed')) }),
  });
  const updateM = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; zoneId?: string; country?: string }) =>
      updateLocality(id, payload),
    onSuccess: () => { invalidate(); setEditing(null); push({ kind: 'ok', title: t('localities.updated') }); },
    onError: (err) => push({ kind: 'error', title: t('localities.updateRefused'), msg: errMsg(err, t('localities.updateFailed')) }),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteLocality(id),
    onSuccess: () => { invalidate(); setToDelete(null); push({ kind: 'ok', title: t('localities.deleted') }); },
    onError: (err) => push({ kind: 'error', title: t('localities.deleteRefused'), msg: errMsg(err, t('localities.deleteFailed')) }),
  });

  const rows = useMemo(() => {
    const all = localitiesQ.data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((l) => `${l.name} ${l.zoneName ?? ''} ${l.country ?? ''}`.toLowerCase().includes(q));
  }, [localitiesQ.data, search]);

  const zones = zonesQ.data ?? [];
  const canCreate = canDirect && ministryId != null && zones.length > 0;

  const cols: Column<LocalityResponse>[] = [
    { label: t('localities.colLocality'), render: (l) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{l.name}</span> },
    {
      label: t('common.zone'),
      render: (l) => l.zoneName ? <Badge tone="earth">{l.zoneName}</Badge> : <span style={{ color: 'var(--ink-400)' }}>{t('localities.outOfZone')}</span>,
    },
    { label: t('common.country'), render: (l) => l.country ?? <span style={{ color: 'var(--ink-400)' }}>—</span> },
    ...(canWrite || canDelete
      ? [{
          label: '',
          style: { width: 90 },
          render: (l: LocalityResponse) => (
            <div className="row-actions">
              {canWrite && (
                <IconButton icon={<Icon name="edit" size={15} />} title={t('common.edit')} onClick={() => setEditing(l)} />
              )}
              {canDelete && (
                <IconButton icon={<Icon name="trash" size={15} />} danger title={t('common.delete')} onClick={() => setToDelete(l)} />
              )}
            </div>
          ),
        } as Column<LocalityResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title={t('localities.title')}
        crumbs={[t('common.brand'), t('nav.structure'), t('localities.title')]}
        actions={
          // RDG 25/07 : la création d'une ville est réservée au back-office (SUPER_ADMIN) et au
          // SECRETARIAT — plus de demande possible pour ce niveau.
          canDirect ? (
            <Button
              variant="primary"
              iconL={<Icon name="plus" size={15} />}
              disabled={!canCreate}
              title={canCreate ? undefined : t('localities.noZoneHint')}
              onClick={() => setCreating(true)}
            >
              {t('localities.newLocality')}
            </Button>
          ) : undefined
        }
      />

      <div className="content">
        <p className="section-sub">{t('localities.intro')}</p>

        <div className="filters">
          <Field label={t('common.searchLabel')} style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder={t('localities.searchPlaceholder')}
              icon={<Icon name="search" size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          {t('localities.count', { count: rows.length })}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<LocalityResponse>
            columns={cols}
            rows={rows}
            zebra
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icon name="locality" size={26} /></div>
                <h4>{t('localities.noLocality')}</h4>
                <p>{canCreate ? t('localities.createFirst') : t('localities.noneInScope')}</p>
              </div>
            }
          />
        </div>
      </div>

      <LocalityFormModal
        open={creating}
        onClose={() => setCreating(false)}
        zones={zones}
        submitting={createM.isPending}
        onSubmit={(v) => ministryId && createM.mutate({ ministryId, zoneId: v.zoneId, name: v.name, country: v.country })}
      />
      <LocalityFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        zones={zones}
        locality={editing ?? undefined}
        submitting={updateM.isPending}
        onSubmit={(v) => editing && updateM.mutate({ id: editing.id, name: v.name, zoneId: v.zoneId, country: v.country })}
      />
      <ConfirmDelete
        open={toDelete != null}
        label={toDelete ? t('localities.deleteLabel', { name: toDelete.name }) : ''}
        submitting={deleteM.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
      />
    </>
  );
}

function LocalityFormModal({
  open,
  onClose,
  zones,
  locality,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  zones: ZoneResponse[];
  locality?: LocalityResponse;
  submitting: boolean;
  onSubmit: (v: { zoneId: string; name: string; country: string }) => void;
}) {
  const { t } = useTranslation();
  const isEdit = locality != null;
  const [zoneId, setZoneId] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      setZoneId(locality?.zoneId ?? zones[0]?.id ?? '');
      setName(locality?.name ?? '');
    }
  }, [open, locality, zones]);

  const valid = name.trim().length > 0 && zoneId !== '';
  // Le libellé « pays » est dérivé de la zone choisie (Country -> Zone -> Locality).
  const country = zones.find((z) => z.id === zoneId)?.countryName ?? '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('localities.editTitle') : t('localities.newTitle')}
      sub={isEdit ? undefined : t('localities.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!valid || submitting}
            onClick={() => onSubmit({ zoneId, name: name.trim(), country })}
          >
            {submitting ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label={t('common.zone')}>
          <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name} — {z.countryName}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('localities.nameLabel')}>
          <Input placeholder={t('localities.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
