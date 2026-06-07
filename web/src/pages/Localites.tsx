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
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { canManageStructure } from '../services/authApi';
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
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const ministryId = me?.ministryId ?? null;
  const canWrite = canManageStructure(me);

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LocalityResponse | null>(null);
  const [toDelete, setToDelete] = useState<LocalityResponse | null>(null);

  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones() });
  const localitiesQ = useQuery({ queryKey: ['admin', 'localities'], queryFn: () => listLocalities() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'localities'] });

  const createM = useMutation({
    mutationFn: createLocality,
    onSuccess: () => { invalidate(); setCreating(false); push({ kind: 'ok', title: 'Localité créée' }); },
    onError: (err) => push({ kind: 'error', title: 'Création refusée', msg: errMsg(err, 'Création impossible.') }),
  });
  const updateM = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; zoneId?: string; country?: string }) =>
      updateLocality(id, payload),
    onSuccess: () => { invalidate(); setEditing(null); push({ kind: 'ok', title: 'Localité mise à jour' }); },
    onError: (err) => push({ kind: 'error', title: 'Mise à jour refusée', msg: errMsg(err, 'Mise à jour impossible.') }),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteLocality(id),
    onSuccess: () => { invalidate(); setToDelete(null); push({ kind: 'ok', title: 'Localité supprimée' }); },
    onError: (err) => push({ kind: 'error', title: 'Suppression refusée', msg: errMsg(err, 'Suppression impossible.') }),
  });

  const rows = useMemo(() => {
    const all = localitiesQ.data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((l) => `${l.name} ${l.zoneName ?? ''} ${l.country ?? ''}`.toLowerCase().includes(q));
  }, [localitiesQ.data, search]);

  const zones = zonesQ.data ?? [];
  const canCreate = canWrite && zones.length > 0 && ministryId != null;

  const cols: Column<LocalityResponse>[] = [
    { label: 'Localité', render: (l) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{l.name}</span> },
    {
      label: 'Zone',
      render: (l) => l.zoneName ? <Badge tone="earth">{l.zoneName}</Badge> : <span style={{ color: 'var(--ink-400)' }}>Hors zone</span>,
    },
    { label: 'Pays', render: (l) => l.country ?? <span style={{ color: 'var(--ink-400)' }}>—</span> },
    ...(canWrite
      ? [{
          label: '',
          style: { width: 90 },
          render: (l: LocalityResponse) => (
            <div className="row-actions">
              <IconButton icon={<Icon name="edit" size={15} />} title="Modifier" onClick={() => setEditing(l)} />
              <IconButton icon={<Icon name="trash" size={15} />} danger title="Supprimer" onClick={() => setToDelete(l)} />
            </div>
          ),
        } as Column<LocalityResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title="Localités"
        crumbs={['shephr', 'Structure', 'Localités']}
        actions={
          <Button
            variant="primary"
            iconL={<Icon name="plus" size={15} />}
            disabled={!canCreate}
            title={canCreate ? undefined : 'Aucune zone dans votre périmètre où créer une localité.'}
            onClick={() => setCreating(true)}
          >
            Nouvelle localité
          </Button>
        }
      />

      <div className="content">
        <p className="section-sub">Villes / régions d'une zone. Une localité regroupe des unités (centres et assemblées).</p>

        <div className="filters">
          <Field label="Recherche" style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder="Nom, zone ou pays…"
              icon={<Icon name="search" size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          <strong style={{ color: 'var(--ink-800)' }}>{rows.length}</strong> localité(s)
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<LocalityResponse>
            columns={cols}
            rows={rows}
            zebra
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icon name="locality" size={26} /></div>
                <h4>Aucune localité</h4>
                <p>{canCreate ? 'Créez votre première localité.' : 'Aucune localité dans votre périmètre.'}</p>
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
        onSubmit={(v) =>
          ministryId && createM.mutate({ ministryId, zoneId: v.zoneId, name: v.name, country: v.country })
        }
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
        label={toDelete ? `la localité « ${toDelete.name} »` : ''}
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
      title={isEdit ? 'Modifier la localité' : 'Nouvelle localité'}
      sub={isEdit ? undefined : 'Rattachez la localité à une zone de votre périmètre.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={!valid || submitting}
            onClick={() => onSubmit({ zoneId, name: name.trim(), country })}
          >
            {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Zone">
          <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name} — {z.countryName}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nom de la localité">
          <Input placeholder="Londres…" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
