import { useEffect, useMemo, useState } from 'react';
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
    onSuccess: () => { invalidate(); setCreating(false); push({ kind: 'ok', title: 'Unité créée' }); },
    onError: (err) => push({ kind: 'error', title: 'Création refusée', msg: errMsg(err, 'Création impossible.') }),
  });
  const updateM = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; localityId?: string; type?: UnitType; active?: boolean }) =>
      updateUnit(id, payload),
    onSuccess: () => { invalidate(); setEditing(null); push({ kind: 'ok', title: 'Unité mise à jour' }); },
    onError: (err) => push({ kind: 'error', title: 'Mise à jour refusée', msg: errMsg(err, 'Mise à jour impossible.') }),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteUnit(id),
    onSuccess: () => { invalidate(); setToDelete(null); push({ kind: 'ok', title: 'Unité supprimée' }); },
    onError: (err) => push({ kind: 'error', title: 'Suppression refusée', msg: errMsg(err, 'Suppression impossible.') }),
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
    { label: 'Unité', render: (u) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{u.name}</span> },
    { label: 'Type', render: (u) => <UnitTypeBadge type={u.type} /> },
    { label: 'Localité', render: (u) => u.localityName },
    {
      label: 'Code',
      render: (u) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-600)' }}>{u.joinCode}</span>,
    },
    { label: 'Statut', render: (u) => <StatusBadge active={u.active} /> },
    ...(canWrite
      ? [{
          label: '',
          style: { width: 90 },
          render: (u: UnitResponse) => (
            <div className="row-actions">
              <IconButton icon={<Icon name="edit" size={15} />} title="Modifier" onClick={() => setEditing(u)} />
              <IconButton icon={<Icon name="trash" size={15} />} danger title="Supprimer" onClick={() => setToDelete(u)} />
            </div>
          ),
        } as Column<UnitResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title="Unités"
        crumbs={['shephr', 'Structure', 'Unités']}
        actions={
          <Button
            variant="primary"
            iconL={<Icon name="plus" size={15} />}
            disabled={!canCreate}
            title={canCreate ? undefined : 'Aucune localité dans votre périmètre où créer une unité.'}
            onClick={() => setCreating(true)}
          >
            Nouvelle unité
          </Button>
        }
      />

      <div className="content">
        <p className="section-sub">Centres et assemblées d'une localité. Les membres rejoignent une unité via son code.</p>

        <div className="filters">
          <Field label="Recherche" style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder="Nom, localité ou code…"
              icon={<Icon name="search" size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          <strong style={{ color: 'var(--ink-800)' }}>{rows.length}</strong> unité(s)
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<UnitResponse>
            columns={cols}
            rows={rows}
            zebra
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icon name="unit" size={26} /></div>
                <h4>Aucune unité</h4>
                <p>{canCreate ? 'Créez votre première unité.' : 'Aucune unité dans votre périmètre.'}</p>
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
        label={toDelete ? `l'unité « ${toDelete.name} »` : ''}
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
      title={isEdit ? "Modifier l'unité" : 'Nouvelle unité'}
      sub={isEdit ? undefined : 'Rattachez l’unité à une localité de votre périmètre.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={!valid || submitting}
            onClick={() => onSubmit({ localityId, name: name.trim(), type, active })}
          >
            {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Localité">
          <Select value={localityId} onChange={(e) => setLocalityId(e.target.value)}>
            {localities.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.zoneName ? ` — ${l.zoneName}` : ''}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nom de l'unité">
          <Input placeholder="Centre Londres…" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as UnitType)}>
            <option value="CENTER">Centre</option>
            <option value="ASSEMBLY">Assemblée</option>
          </Select>
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
