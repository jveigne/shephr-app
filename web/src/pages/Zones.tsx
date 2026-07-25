import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
  StatusBadge,
  Table,
  Toggle,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { canManageZones } from '../services/authApi';
import {
  createZone,
  deleteZone,
  listCountries,
  listZones,
  updateZone,
  type ZoneResponse,
} from '../services/adminApi';

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function ZonesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const navigate = useNavigate();
  const canWrite = canManageZones(me);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ZoneResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ZoneResponse | null>(null);

  const countriesQ = useQuery({ queryKey: ['admin', 'countries'], queryFn: listCountries });
  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'zones'] });

  const createM = useMutation({
    mutationFn: createZone,
    onSuccess: () => {
      invalidate();
      setCreating(false);
      push({ kind: 'ok', title: t('zones.created') });
    },
    onError: (err) => push({ kind: 'error', title: t('zones.createRefused'), msg: errMsg(err, t('zones.createFailed')) }),
  });

  const updateM = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; description?: string; active?: boolean }) =>
      updateZone(id, payload),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      push({ kind: 'ok', title: t('zones.updated') });
    },
    onError: (err) => push({ kind: 'error', title: t('zones.updateRefused'), msg: errMsg(err, t('zones.updateFailed')) }),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteZone(id),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      push({ kind: 'ok', title: t('zones.deleted') });
    },
    onError: (err) => push({ kind: 'error', title: t('zones.deleteRefused'), msg: errMsg(err, t('zones.deleteFailed')) }),
  });

  const rows = useMemo(() => {
    const all = zonesQ.data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((z) => `${z.name} ${z.countryName}`.toLowerCase().includes(q));
  }, [zonesQ.data, search]);

  const countries = countriesQ.data ?? [];
  const canCreate = canWrite && countries.length > 0;

  const cols: Column<ZoneResponse>[] = [
    { label: t('zones.colZone'), render: (z) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{z.name}</span> },
    {
      label: t('zones.colCountry'),
      render: (z) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {z.countryName}
          <Badge tone="gray">{z.countryCode}</Badge>
        </span>
      ),
    },
    {
      label: t('zones.colDescription'),
      render: (z) => z.description ? z.description : <span style={{ color: 'var(--ink-400)' }}>—</span>,
    },
    { label: t('common.status'), render: (z) => <StatusBadge active={z.active} /> },
    ...(canWrite
      ? [{
          label: '',
          style: { width: 90 },
          render: (z: ZoneResponse) => (
            <div className="row-actions">
              <IconButton icon={<Icon name="edit" size={15} />} title={t('common.edit')} onClick={() => setEditing(z)} />
              <IconButton icon={<Icon name="trash" size={15} />} danger title={t('common.delete')} onClick={() => setToDelete(z)} />
            </div>
          ),
        } as Column<ZoneResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title={t('zones.title')}
        crumbs={[t('common.brand'), t('nav.structure'), t('zones.title')]}
        actions={
          // RG-DS-05 (22/07) : la création directe est réservée au SUPER_ADMIN — les dirigeants
          // déposent une demande validée par le secrétariat (page Demandes).
          me?.superAdmin ? (
            <Button
              variant="primary"
              iconL={<Icon name="plus" size={15} />}
              disabled={!canCreate}
              title={canCreate ? undefined : t('zones.noCountryHint')}
              onClick={() => setCreating(true)}
            >
              {t('zones.newZone')}
            </Button>
          ) : canWrite ? (
            <Button
              variant="primary"
              iconL={<Icon name="plus" size={15} />}
              onClick={() => navigate('/requests')}
            >
              {t('zones.requestZone')}
            </Button>
          ) : undefined
        }
      />

      <div className="content">
        <p className="section-sub">
          {t('zones.intro')}
        </p>

        <div className="filters">
          <Field label={t('common.searchLabel')} style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder={t('zones.searchPlaceholder')}
              icon={<Icon name="search" size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          {t('zones.count', { count: rows.length })}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<ZoneResponse>
            columns={cols}
            rows={rows}
            zebra
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icon name="building" size={26} /></div>
                <h4>{t('zones.noZone')}</h4>
                <p>{canCreate ? t('zones.createFirst') : t('zones.noneInScope')}</p>
              </div>
            }
          />
        </div>
      </div>

      <ZoneFormModal
        open={creating}
        onClose={() => setCreating(false)}
        countries={countries}
        submitting={createM.isPending}
        onSubmit={(v) => createM.mutate({ countryId: v.countryId, name: v.name, description: v.description || undefined })}
      />

      <ZoneFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        countries={countries}
        zone={editing ?? undefined}
        submitting={updateM.isPending}
        onSubmit={(v) =>
          editing && updateM.mutate({ id: editing.id, name: v.name, description: v.description, active: v.active })
        }
      />

      <ConfirmDelete
        open={toDelete != null}
        label={toDelete ? t('zones.deleteLabel', { name: toDelete.name }) : ''}
        submitting={deleteM.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
      />
    </>
  );
}

function ZoneFormModal({
  open,
  onClose,
  countries,
  zone,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  countries: { id: string; name: string; code: string }[];
  zone?: ZoneResponse;
  submitting: boolean;
  onSubmit: (v: { countryId: string; name: string; description: string; active: boolean }) => void;
}) {
  const { t } = useTranslation();
  const isEdit = zone != null;
  const [countryId, setCountryId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  // Réinitialise le formulaire à chaque ouverture.
  useEffect(() => {
    if (open) {
      setCountryId(zone?.countryId ?? countries[0]?.id ?? '');
      setName(zone?.name ?? '');
      setDescription(zone?.description ?? '');
      setActive(zone?.active ?? true);
    }
  }, [open, zone, countries]);

  const valid = name.trim().length > 0 && (isEdit || countryId !== '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('zones.editTitle') : t('zones.newTitle')}
      sub={isEdit ? undefined : t('zones.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!valid || submitting}
            onClick={() => onSubmit({ countryId, name: name.trim(), description: description.trim(), active })}
          >
            {submitting ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isEdit && (
          <Field label={t('common.country')}>
            <Select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('zones.nameLabel')}>
          <Input placeholder={t('zones.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('common.description')} hint={t('common.optional')}>
          <Input placeholder={t('zones.descPlaceholder')} value={description} onChange={(e) => setDescription(e.target.value)} />
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

export function ConfirmDelete({
  open,
  label,
  submitting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  label: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('common.deleteTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={submitting} onClick={onConfirm}>
            {submitting ? t('common.deleting') : t('common.delete')}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--ink-600)' }}>
        {t('common.deleteConfirm', { label })}
      </p>
    </Modal>
  );
}
