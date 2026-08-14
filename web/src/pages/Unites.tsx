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
  Pagination,
  Select,
  StatusBadge,
  Table,
  Toggle,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { canManageUnits, isSecretariat } from '../services/authApi';
import {
  createUnit,
  deleteUnit,
  listAssemblyHistory,
  listLocalities,
  listUnits,
  listUsers,
  updateUnit,
  type AssemblyCreationRow,
  type LocalityResponse,
  type UnitResponse,
} from '../services/adminApi';
import { ConfirmDelete } from './Zones';

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export function UnitesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const navigate = useNavigate();
  const ministryId = me?.ministryId ?? null;
  const canWrite = canManageUnits(me);
  // Palier C4 (JP 14/08) : l'onglet Historique n'est proposé qu'au SECRETARIAT et au SUPER_ADMIN,
  // miroir de la garde serveur de GET /units/history (tout autre rôle → 403).
  const canSeeHistory = isSecretariat(me) || !!me?.superAdmin;

  const [tab, setTab] = useState<'units' | 'history'>('units');
  const activeTab = canSeeHistory ? tab : 'units';
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
    mutationFn: ({ id, ...payload }: { id: string; name?: string; localityId?: string; active?: boolean }) =>
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
          // Palier C1 (JP 14/08) : la création directe est ouverte aux dirigeants — le garde
          // RG-DS-05 (« passez par une demande ») est retiré côté serveur. Le périmètre (« dans MA
          // ville ») reste vérifié par le backend, qui répond 403.
          canCreate ? (
            <Button
              variant="primary"
              iconL={<Icon name="plus" size={15} />}
              disabled={!canCreate}
              title={canCreate ? undefined : t('units.noLocalityHint')}
              onClick={() => setCreating(true)}
            >
              {t('units.newUnit')}
            </Button>
          ) : (canWrite || me?.donationRole === 'DIRIGEANT_UNITE' || me?.goalRole === 'DIRIGEANT_UNITE') ? (
            <Button
              variant="primary"
              iconL={<Icon name="plus" size={15} />}
              onClick={() => navigate('/requests')}
            >
              {t('units.requestUnit')}
            </Button>
          ) : undefined
        }
      />

      <div className="content">
        {canSeeHistory && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Button variant={activeTab === 'units' ? 'primary' : 'ghost'} onClick={() => setTab('units')}>
              {t('units.tabUnits')}
            </Button>
            <Button variant={activeTab === 'history' ? 'primary' : 'ghost'} onClick={() => setTab('history')}>
              {t('units.tabHistory')}
            </Button>
          </div>
        )}

        {activeTab === 'history' ? (
          <AssemblyHistory />
        ) : (
          <>
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
          </>
        )}
      </div>

      <UnitFormModal
        open={creating}
        onClose={() => setCreating(false)}
        localities={localities}
        submitting={createM.isPending}
        requireLeader={!me?.superAdmin}
        onSubmit={(v) =>
          ministryId && createM.mutate({
            ministryId, localityId: v.localityId, name: v.name, leaderUserId: v.leaderUserId,
          })
        }
      />
      <UnitFormModal
        open={editing != null}
        onClose={() => setEditing(null)}
        localities={localities}
        unit={editing ?? undefined}
        submitting={updateM.isPending}
        onSubmit={(v) => editing && updateM.mutate({ id: editing.id, name: v.name, localityId: v.localityId, active: v.active })}
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

/** Taille de page alignée sur le défaut serveur (`size=25`). */
const HISTORY_PER_PAGE = 25;

/** `Table` indexe ses lignes sur `id` — l'historique est identifié par l'assemblée créée. */
type HistoryRow = AssemblyCreationRow & { id: string };

/**
 * Palier C4 (JP 14/08) — onglet « Historique » : qui a créé quelle assemblée, et quand.
 *
 * <p>Le tri (plus récentes d'abord) et la pagination sont portés par le SERVEUR : on ne re-trie
 * rien localement, cela ne trierait que la page courante.
 */
function AssemblyHistory() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(0);

  const historyQ = useQuery({
    // Préfixe ['admin', 'units'] : la création d'une assemblée invalide aussi l'historique.
    queryKey: ['admin', 'units', 'history', page],
    // `ministryId` omis : le backend applique le périmètre de l'appelant (SUPER_ADMIN = tous les
    // ministères, SECRETARIAT = le sien).
    queryFn: () => listAssemblyHistory({ page, size: HISTORY_PER_PAGE }),
  });

  const dateLocale = (i18n.resolvedLanguage || i18n.language) === 'en' ? 'en-GB' : 'fr-FR';
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? t('common.none')
      : d.toLocaleString(dateLocale, {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
  };

  const rows: HistoryRow[] = (historyQ.data?.content ?? []).map((r) => ({ ...r, id: r.unitId }));
  const total = historyQ.data?.totalElements ?? 0;
  const pageCount = historyQ.data?.totalPages ?? 0;

  const cols: Column<HistoryRow>[] = [
    {
      label: t('common.name'),
      render: (r) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{r.name}</span>,
    },
    { label: t('common.locality'), render: (r) => r.cityName ?? t('common.none') },
    { label: t('common.zone'), render: (r) => r.regionName ?? t('common.none') },
    { label: t('units.histColNation'), render: (r) => r.nationName ?? t('common.none') },
    {
      label: t('units.histColCreatedBy'),
      // createdByName null = assemblée créée AVANT la migration org/18 : auteur inconnu, « — ».
      render: (r) =>
        r.createdByName == null ? (
          t('common.none')
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {r.createdByName}
            {r.createdByRole && <Badge tone="gray">{t(`roles.${r.createdByRole}`)}</Badge>}
          </span>
        ),
    },
    {
      label: t('common.date'),
      render: (r) => <span style={{ color: 'var(--ink-600)' }}>{fmtDate(r.createdAt)}</span>,
    },
  ];

  // En erreur (403, réseau…), on n'affiche NI le compteur NI l'état vide : « 0 création /
  // aucune assemblée créée » serait une affirmation fausse alors qu'on n'a simplement rien lu.
  if (historyQ.isError) {
    return (
      <>
        <p className="section-sub">{t('units.histIntro')}</p>
        <div className="card" style={{ padding: 0 }}>
          <div className="empty">
            <div className="icon-wrap"><Icon name="unit" size={26} /></div>
            <h4>{t('units.histLoadFailed')}</h4>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="section-sub">{t('units.histIntro')}</p>

      <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
        {historyQ.isLoading ? t('common.loading') : t('units.histCount', { count: total })}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <Table<HistoryRow>
          columns={cols}
          rows={rows}
          zebra
          empty={
            <div className="empty">
              <div className="icon-wrap"><Icon name="unit" size={26} /></div>
              <h4>{t('units.histEmpty')}</h4>
              <p>{t('units.histEmptyHint')}</p>
            </div>
          }
        />
        {total > 0 && (
          <Pagination
            page={page + 1}
            pageCount={pageCount}
            total={total}
            perPage={HISTORY_PER_PAGE}
            onPage={(p) => setPage(p - 1)}
          />
        )}
      </div>
    </>
  );
}

/** Debounce minimal — cette surface n'a pas de hook dédié (contrairement à shephr-webapp). */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function UnitFormModal({
  open,
  onClose,
  localities,
  unit,
  submitting,
  requireLeader = false,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  localities: LocalityResponse[];
  unit?: UnitResponse;
  submitting: boolean;
  /**
   * Palier C1-bis (JP 14/08) — le responsable est obligatoire à la création, sauf pour le
   * SUPER_ADMIN (le back-office construit l'arbre avant que les comptes n'existent).
   */
  requireLeader?: boolean;
  onSubmit: (v: { localityId: string; name: string; active: boolean; leaderUserId?: string }) => void;
}) {
  const { t } = useTranslation();
  const isEdit = unit != null;
  const [localityId, setLocalityId] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [leaderId, setLeaderId] = useState('');
  const [leaderQuery, setLeaderQuery] = useState('');

  useEffect(() => {
    if (open) {
      setLocalityId(unit?.localityId ?? localities[0]?.id ?? '');
      setName(unit?.name ?? '');
      setActive(unit?.active ?? true);
      setLeaderId(''); setLeaderQuery('');
    }
  }, [open, unit, localities]);

  // Recherche serveur : l'annuaire d'un ministère ne se charge pas en entier (cf. Utilisateurs).
  const needsLeader = !isEdit && requireLeader;
  const debouncedLeaderQuery = useDebouncedValue(leaderQuery, 300);
  const leadersQ = useQuery({
    queryKey: ['admin', 'user-search', debouncedLeaderQuery],
    queryFn: () => listUsers({ search: debouncedLeaderQuery, active: true, size: 10 }),
    enabled: needsLeader && debouncedLeaderQuery.trim().length >= 2,
  });
  const leaders = leadersQ.data?.content ?? [];

  const valid = name.trim().length > 0 && localityId !== ''
    // Sans responsable, le backend refuse (422 UNIT_LEADER_REQUIRED).
    && (!needsLeader || leaderId !== '');

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
            onClick={() => onSubmit({
              localityId, name: name.trim(), active,
              leaderUserId: needsLeader ? leaderId : undefined,
            })}
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
        {/* Palier C1-bis — responsable OBLIGATOIRE : une assemblée sans dirigeant n'est
            administrable par personne. Compte existant uniquement (décision JP 14/08). */}
        {needsLeader && (
          <Field label={t('units.leaderLabel')} hint={t('units.leaderHint')}>
            <div style={{ display: 'grid', gap: 6 }}>
              <Input
                placeholder={t('units.leaderSearchPlaceholder')}
                value={leaderQuery}
                onChange={(e) => { setLeaderQuery(e.target.value); setLeaderId(''); }}
              />
              {leadersQ.isFetching && <span className="section-sub">{t('common.loading')}</span>}
              {!leadersQ.isFetching && debouncedLeaderQuery.trim().length >= 2 && leaders.length === 0 && (
                <span className="section-sub">{t('units.leaderNoResult')}</span>
              )}
              {leaders.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setLeaderId(u.id); setLeaderQuery(u.fullName); }}
                  style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${leaderId === u.id ? 'var(--green-800)' : 'var(--line)'}`,
                    background: leaderId === u.id ? 'var(--paper-2, #faf7f0)' : 'transparent',
                    fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--ink-700)',
                  }}
                >
                  {u.fullName}
                  <span style={{ color: 'var(--ink-400)' }}> · {u.username ?? u.email ?? ''}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
        {isEdit && (
          <Field label={t('common.status')}>
            <Toggle checked={active} onChange={setActive} label={active ? t('common.activeFem') : t('common.inactiveFem')} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
