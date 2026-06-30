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
  StatusBadge,
  Table,
  Toggle,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { canManageStructure } from '../services/authApi';
import {
  createTeam,
  deleteTeam,
  listTeams,
  listZones,
  updateTeam,
  type TeamResponse,
  type ZoneResponse,
} from '../services/adminApi';
import { ConfirmDelete } from './Zones';

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function TeamsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const canWrite = canManageStructure(me);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TeamResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<TeamResponse | null>(null);

  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones() });
  const teamsQ = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => listTeams() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });

  const createM = useMutation({
    mutationFn: createTeam,
    onSuccess: () => { invalidate(); setCreating(false); push({ kind: 'ok', title: t('teams.created') }); },
    onError: (err) => push({ kind: 'error', title: t('teams.createRefused'), msg: errMsg(err, t('teams.createFailed')) }),
  });

  const updateM = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; active?: boolean }) => updateTeam(id, payload),
    onSuccess: () => { invalidate(); setEditing(null); push({ kind: 'ok', title: t('teams.updated') }); },
    onError: (err) => push({ kind: 'error', title: t('teams.updateRefused'), msg: errMsg(err, t('teams.updateFailed')) }),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => { invalidate(); setToDelete(null); push({ kind: 'ok', title: t('teams.deleted') }); },
    onError: (err) => push({ kind: 'error', title: t('teams.deleteRefused'), msg: errMsg(err, t('teams.deleteFailed')) }),
  });

  const rows = useMemo(() => {
    const all = teamsQ.data ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((tm) => `${tm.name} ${tm.zoneName ?? ''}`.toLowerCase().includes(q));
  }, [teamsQ.data, search]);

  const zones = zonesQ.data ?? [];
  const canCreate = canWrite && zones.length > 0;

  const cols: Column<TeamResponse>[] = [
    { label: t('teams.colTeam'), render: (tm) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{tm.name}</span> },
    {
      label: t('teams.colZone'),
      render: (tm) => tm.zoneName ? tm.zoneName : <span style={{ color: 'var(--ink-400)' }}>—</span>,
    },
    { label: t('common.status'), render: (tm) => <StatusBadge active={tm.active} /> },
    ...(canWrite
      ? [{
          label: '',
          style: { width: 90 },
          render: (tm: TeamResponse) => (
            <div className="row-actions">
              <IconButton icon={<Icon name="edit" size={15} />} title={t('common.edit')} onClick={() => setEditing(tm)} />
              <IconButton icon={<Icon name="trash" size={15} />} danger title={t('common.delete')} onClick={() => setToDelete(tm)} />
            </div>
          ),
        } as Column<TeamResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title={t('teams.title')}
        crumbs={[t('common.brand'), t('nav.structure'), t('teams.title')]}
        actions={
          <Button
            variant="primary"
            iconL={<Icon name="plus" size={15} />}
            disabled={!canCreate}
            title={canCreate ? undefined : t('teams.noZoneHint')}
            onClick={() => setCreating(true)}
          >
            {t('teams.newTeam')}
          </Button>
        }
      />

      <div className="content">
        <p className="section-sub">{t('teams.intro')}</p>

        <div className="filters">
          <Field label={t('common.searchLabel')} style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder={t('teams.searchPlaceholder')}
              icon={<Icon name="search" size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          {t('teams.count', { count: rows.length })}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<TeamResponse>
            columns={cols}
            rows={rows}
            zebra
            empty={
              <div className="empty">
                <div className="icon-wrap"><Icon name="users" size={26} /></div>
                <h4>{t('teams.noTeam')}</h4>
                <p>{canCreate ? t('teams.createFirst') : t('teams.noneInScope')}</p>
              </div>
            }
          />
        </div>
      </div>

      <TeamFormModal
        open={creating}
        onClose={() => setCreating(false)}
        zones={zones}
        submitting={createM.isPending}
        onSubmit={(v) => createM.mutate({ zoneId: v.zoneId, name: v.name })}
      />

      <TeamFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        zones={zones}
        team={editing ?? undefined}
        submitting={updateM.isPending}
        onSubmit={(v) => editing && updateM.mutate({ id: editing.id, name: v.name, active: v.active })}
      />

      <ConfirmDelete
        open={toDelete != null}
        label={toDelete ? t('teams.deleteLabel', { name: toDelete.name }) : ''}
        submitting={deleteM.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
      />
    </>
  );
}

function TeamFormModal({
  open,
  onClose,
  zones,
  team,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  zones: ZoneResponse[];
  team?: TeamResponse;
  submitting: boolean;
  onSubmit: (v: { zoneId: string; name: string; active: boolean }) => void;
}) {
  const { t } = useTranslation();
  const isEdit = team != null;
  const [zoneId, setZoneId] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setZoneId(team?.zoneId ?? zones[0]?.id ?? '');
      setName(team?.name ?? '');
      setActive(team?.active ?? true);
    }
  }, [open, team, zones]);

  const valid = name.trim().length > 0 && (isEdit || zoneId !== '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('teams.editTitle') : t('teams.newTitle')}
      sub={isEdit ? undefined : t('teams.newSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!valid || submitting}
            onClick={() => onSubmit({ zoneId, name: name.trim(), active })}
          >
            {submitting ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isEdit && (
          <Field label={t('teams.zone')}>
            <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name} — {z.countryName}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('teams.nameLabel')}>
          <Input placeholder={t('teams.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
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
