import { useEffect, useMemo, useState } from 'react';
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
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
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
      push({ kind: 'ok', title: 'Zone créée' });
    },
    onError: (err) => push({ kind: 'error', title: 'Création refusée', msg: errMsg(err, 'Création impossible.') }),
  });

  const updateM = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; description?: string; active?: boolean }) =>
      updateZone(id, payload),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      push({ kind: 'ok', title: 'Zone mise à jour' });
    },
    onError: (err) => push({ kind: 'error', title: 'Mise à jour refusée', msg: errMsg(err, 'Mise à jour impossible.') }),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteZone(id),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      push({ kind: 'ok', title: 'Zone supprimée' });
    },
    onError: (err) => push({ kind: 'error', title: 'Suppression refusée', msg: errMsg(err, 'Suppression impossible.') }),
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
    { label: 'Zone', render: (z) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{z.name}</span> },
    {
      label: 'Pays',
      render: (z) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {z.countryName}
          <Badge tone="gray">{z.countryCode}</Badge>
        </span>
      ),
    },
    {
      label: 'Description',
      render: (z) => z.description ? z.description : <span style={{ color: 'var(--ink-400)' }}>—</span>,
    },
    { label: 'Statut', render: (z) => <StatusBadge active={z.active} /> },
    ...(canWrite
      ? [{
          label: '',
          style: { width: 90 },
          render: (z: ZoneResponse) => (
            <div className="row-actions">
              <IconButton icon={<Icon name="edit" size={15} />} title="Modifier" onClick={() => setEditing(z)} />
              <IconButton icon={<Icon name="trash" size={15} />} danger title="Supprimer" onClick={() => setToDelete(z)} />
            </div>
          ),
        } as Column<ZoneResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title="Zones"
        crumbs={['shephr', 'Structure', 'Zones']}
        actions={
          <Button
            variant="primary"
            iconL={<Icon name="plus" size={15} />}
            disabled={!canCreate}
            title={canCreate ? undefined : "Aucun pays dans votre périmètre (réservé aux coordinateurs)."}
            onClick={() => setCreating(true)}
          >
            Nouvelle zone
          </Button>
        }
      />

      <div className="content">
        <p className="section-sub">
          Subdivisions d'un pays. Une zone regroupe des localités. Réservé aux coordinateurs de pays.
        </p>

        <div className="filters">
          <Field label="Recherche" style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder="Nom de zone ou pays…"
              icon={<Icon name="search" size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          <strong style={{ color: 'var(--ink-800)' }}>{rows.length}</strong> zone(s)
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<ZoneResponse>
            columns={cols}
            rows={rows}
            zebra
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icon name="building" size={26} /></div>
                <h4>Aucune zone</h4>
                <p>{canCreate ? 'Créez votre première zone.' : 'Aucune zone dans votre périmètre.'}</p>
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
        label={toDelete ? `la zone « ${toDelete.name} »` : ''}
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
      title={isEdit ? 'Modifier la zone' : 'Nouvelle zone'}
      sub={isEdit ? undefined : 'Rattachez la zone à un pays de votre périmètre.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={!valid || submitting}
            onClick={() => onSubmit({ countryId, name: name.trim(), description: description.trim(), active })}
          >
            {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isEdit && (
          <Field label="Pays">
            <Select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Nom de la zone">
          <Input placeholder="Zone Sud…" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" hint="Optionnel">
          <Input placeholder="Description…" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {isEdit && (
          <Field label="Statut">
            <Toggle checked={active} onChange={setActive} label={active ? 'Active' : 'Inactive'} />
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirmer la suppression"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="danger" disabled={submitting} onClick={onConfirm}>
            {submitting ? 'Suppression…' : 'Supprimer'}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--ink-600)' }}>
        Voulez-vous vraiment supprimer {label} ? Cette action est irréversible.
      </p>
    </Modal>
  );
}
