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
  Picker,
  StatusBadge,
  Table,
  Toggle,
  TopBar,
  type Column,
} from '../components/ui';
import { GeoPicker } from '../components/GeoPicker';
import {
  fetchMemberGoals,
  getActiveGoal,
  type MemberGoalsResponse,
  type PledgeResponse,
} from '../services/goalsApi';
import { fetchRequestContext } from '../services/structureRequestsApi';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import {
  assignableRoles,
  canManageUsers,
  type MeResponse,
  type ModuleRole,
} from '../services/authApi';
import {
  deleteUser,
  inviteUser,
  listCountries,
  listLocalities,
  listUnits,
  listUsers,
  listZones,
  updateUser,
  type AdminUserResponse,
  type CountryResponse,
  type InviteUserRequest,
  type LocalityResponse,
  type UnitResponse,
  type UpdateUserRequest,
  type ZoneResponse,
} from '../services/adminApi';

import { FEATURES } from '../config/features';

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

// Les rôles sont conférés PAR MODULE (Goals et Donations sont indépendants — un user
// peut être DIRIGEANT Objectifs sans rôle Dons, et inversement). Le flag
// FEATURES.donations contrôle uniquement la VISIBILITÉ du module Dons dans l'UI
// (livraison « Goals only »), pas la sémantique de Goals.
type ModuleKind = 'goal' | 'donation';
const VISIBLE_MODULES: ModuleKind[] = FEATURES.donations ? ['goal', 'donation'] : ['goal'];

const roleOf = (u: AdminUserResponse, m: ModuleKind) => (m === 'goal' ? u.goalRole : u.donationRole);
const unitIdOf = (u: AdminUserResponse, m: ModuleKind) => (m === 'goal' ? u.goalUnitId : u.donationUnitId);
/** Palier A2 — assemblées SUPPLÉMENTAIRES (le set moins la « home »). */
const extraUnitIdsOf = (u: AdminUserResponse, m: ModuleKind) => {
  const home = unitIdOf(u, m);
  const set = (m === 'goal' ? u.goalUnitIds : u.donationUnitIds) ?? [];
  return set.filter((id) => id !== home);
};
const zoneIdOf = (u: AdminUserResponse, m: ModuleKind) => (m === 'goal' ? u.goalZoneId : u.donationZoneId);
const cityIdOf = (u: AdminUserResponse, m: ModuleKind) => (m === 'goal' ? u.goalCityId : u.donationCityId);
const countryIdsOf = (u: AdminUserResponse, m: ModuleKind) =>
  m === 'goal' ? u.goalCountryIds : u.donationCountryIds;

// 21/07 (décision JP) : le module Goals est réservé aux dirigeants — « Membre » n'est pas
// proposable pour ce module (le backend le refuse aussi hors super-admin).
const conferrableRoles = (me: MeResponse | null, m: ModuleKind): ModuleRole[] =>
  assignableRoles(me).filter((r) => (me?.superAdmin ?? false) || m !== 'goal' || r !== 'MEMBRE');

// JP 31/07 — la recherche web est alignée sur le mobile : filtre géographique en cascade
// (nation › région › ville) + un champ nom soumis explicitement. Les filtres RÔLE et STATUT
// ont été retirés — ils compliquaient l'écran sans servir le cas d'usage réel (retrouver
// une personne).
type Filters = { search: string };
const DEFAULT: Filters = { search: '' };

export function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const canWrite = canManageUsers(me);
  const moduleLabel = (m: ModuleKind) => t(m === 'goal' ? 'users.moduleGoals' : 'users.moduleDonations');

  const [filters, setFilters] = useState<Filters>(DEFAULT);
  // JP 31/07 — filtrage et pagination CÔTÉ SERVEUR (milliers d'utilisateurs).
  // `submittedSearch` n'est alimenté qu'au clic sur « Rechercher » : la recherche par noms
  // approchés est explicite, et elle IGNORE le filtre géographique.
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [placeNodeId, setPlaceNodeId] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserResponse | null>(null);
  const [deleting, setDeleting] = useState<AdminUserResponse | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; link: string; code: string | null } | null>(null);
  const [openedMember, setOpenedMember] = useState<AdminUserResponse | null>(null);

  const unitsQ = useQuery({ queryKey: ['admin', 'units'], queryFn: () => listUnits() });
  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones() });
  const citiesQ = useQuery({ queryKey: ['admin', 'localities'], queryFn: () => listLocalities() });
  const countriesQ = useQuery({ queryKey: ['admin', 'countries'], queryFn: listCountries });

  const contextQ = useQuery({ queryKey: ['structure-requests', 'context'], queryFn: fetchRequestContext });
  const [nationId, setNationId] = useState('');
  const [regionId, setRegionId] = useState('');
  const placeRegions = (contextQ.data?.regions ?? []).filter((r) => !nationId || r.parentId === nationId);
  const placeCities = (contextQ.data?.cities ?? []).filter((c) => !regionId || c.parentId === regionId);

  const usersQ = useQuery({
    queryKey: ['admin', 'users', placeNodeId, submittedSearch, page],
    queryFn: () =>
      listUsers({
        placeNodeId: submittedSearch ? undefined : placeNodeId || undefined,
        search: submittedSearch || undefined,
        page,
        size: PAGE_SIZE,
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const inviteMutation = useMutation({
    mutationFn: inviteUser,
    onSuccess: (data) => {
      invalidate();
      setInviteResult({
        email: data.email,
        link: `${window.location.origin}/invitation/${data.invitationToken}`,
        code: data.invitationShortCode,
      });
    },
    onError: (err) => push({ kind: 'error', title: t('users.inviteRefused'), msg: errMsg(err, t('users.createFailed')) }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateUser>[1]) => updateUser(id, payload),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      push({ kind: 'ok', title: t('users.updated') });
    },
    onError: (err) => push({ kind: 'error', title: t('users.updateRefused'), msg: errMsg(err, t('users.updateFailed')) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      push({ kind: 'ok', title: t('users.deleted') });
    },
    onError: (err) => push({ kind: 'error', title: t('users.deleteRefused'), msg: errMsg(err, t('users.deleteFailed')) }),
  });

  const units = unitsQ.data ?? [];
  const zones = zonesQ.data ?? [];
  const cities = citiesQ.data ?? [];
  const countries = countriesQ.data ?? [];
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? (id ? '…' : null);
  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? (id ? '…' : null);
  const cityOf = (id: string | null) => cities.find((c) => c.id === id) ?? null;

  // Tout est filtré, trié et paginé par le SERVEUR : on affiche ce qu'il renvoie, dans son
  // ordre (la pertinence prime sur l'alphabétique quand une recherche approchée est active).
  const rows = usersQ.data?.content ?? [];

  const perimeterLabel = (u: AdminUserResponse, m: ModuleKind): string => {
    const cIds = countryIdsOf(u, m);
    if (cIds?.length) return countries.filter((c) => cIds.includes(c.id)).map((c) => c.name).join(', ') || t('users.perimeterCountry');
    if (zoneIdOf(u, m)) return t('users.perimeterZone', { name: zoneName(zoneIdOf(u, m)) });
    // Chantier B (décision #7) : un dirigeant de VILLE n'a qu'un cityId → on affiche sa ville.
    if (cityIdOf(u, m)) {
      const city = cityOf(cityIdOf(u, m));
      return t('users.perimeterCity', { city: city?.name ?? '…' });
    }
    if (unitIdOf(u, m)) return unitName(unitIdOf(u, m)) ?? '—';
    return '—';
  };

  const cols: Column<AdminUserResponse>[] = [
    {
      label: t('users.colName'),
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="avatar md">
            {r.fullName.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{r.fullName}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{r.email ?? r.username}</div>
          </div>
        </div>
      ),
    },
    {
      label: VISIBLE_MODULES.length > 1
        ? t('users.colRoles')
        : t('users.colRoleSingle', { module: moduleLabel(VISIBLE_MODULES[0]) }),
      render: (r) => {
        if (r.superAdmin) return <Badge tone="green">{t('roles.superAdmin')}</Badge>;
        const badges = VISIBLE_MODULES.filter((m) => roleOf(r, m)).map((m) => (
          <Badge key={m} tone="earth">
            {VISIBLE_MODULES.length > 1
              ? t('users.roleWithModule', { module: moduleLabel(m), role: t(`roles.${roleOf(r, m)!}`) })
              : t(`roles.${roleOf(r, m)!}`)}
          </Badge>
        ));
        return badges.length > 0 ? (
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{badges}</span>
        ) : (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        );
      },
    },
    {
      label: t('users.colPerimeter'),
      render: (r) => {
        const parts = VISIBLE_MODULES.filter((m) => roleOf(r, m)).map((m) =>
          VISIBLE_MODULES.length > 1
            ? t('users.roleWithModule', { module: moduleLabel(m), role: perimeterLabel(r, m) })
            : perimeterLabel(r, m),
        );
        return <span style={{ color: 'var(--ink-600)' }}>{parts.join(' · ') || '—'}</span>;
      },
    },
    { label: t('common.status'), render: (r) => <StatusBadge active={r.active} /> },
    ...(canWrite
      ? [{
          label: '',
          style: { width: 60 },
          render: (r: AdminUserResponse) =>
            r.superAdmin ? null : (
              // stopPropagation : sans ça, éditer/supprimer ouvrirait aussi les engagements.
              <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                <IconButton icon={<Icon name="edit" size={15} />} title={t('users.manage')} onClick={() => setEditing(r)} />
                <IconButton icon={<Icon name="trash" size={15} />} title={t('users.delete')} onClick={() => setDeleting(r)} />
              </div>
            ),
        } as Column<AdminUserResponse>]
      : []),
  ];

  return (
    <>
      <TopBar
        title={t('users.title')}
        crumbs={[t('common.brand'), t('users.title')]}
        /* JP 31/07 — invitation MASQUÉE : tout se joue désormais à la création du compte
           (inscription libre + rattachement immédiat). La modale et les endpoints restent
           en place pour être rouverts sans travail. */
        actions={
          false && canWrite ? (
            <Button variant="primary" iconL={<Icon name="plus" size={15} />} onClick={() => { setInviteResult(null); setInviteOpen(true); }}>
              {t('users.invite')}
            </Button>
          ) : undefined
        }
      />

      <div className="content">
        <p className="section-sub">
          {t('users.intro')}
        </p>

        {/* Recherche alignée sur le mobile (JP 31/07) : pays › région › ville empilés, puis le
            champ nom et un bouton « Rechercher » pleine largeur. La recherche par noms approchés
            est INDÉPENDANTE du filtre géographique — on cherche une personne où qu'elle soit. */}
        <div className="card" style={{ maxWidth: 460, display: 'grid', gap: 12, marginBottom: 18 }}>
          <div style={{ opacity: submittedSearch ? 0.45 : 1 }}>
            <Field label={t('join.pickNation')}>
              <Picker
                value={nationId}
                onChange={(id) => { setNationId(id); setRegionId(''); setPlaceNodeId(id); setPage(0); }}
                options={(contextQ.data?.nations ?? []).map((n) => ({ id: n.id, label: n.name }))}
                placeholder={t('common.all')}
                disabled={!!submittedSearch}
              />
            </Field>
            <Field label={t('join.pickRegion')}>
              <Picker
                value={regionId}
                onChange={(id) => { setRegionId(id); setPlaceNodeId(id); setPage(0); }}
                options={placeRegions.map((r) => ({ id: r.id, label: r.name }))}
                placeholder={t('common.all')}
                disabled={!nationId || !!submittedSearch}
              />
            </Field>
            <Field label={t('join.pickCity')}>
              <Picker
                value={placeCities.some((c) => c.id === placeNodeId) ? placeNodeId : ''}
                onChange={(id) => { setPlaceNodeId(id || regionId || nationId); setPage(0); }}
                options={placeCities.map((c) => ({ id: c.id, label: c.name }))}
                placeholder={t('common.all')}
                disabled={!regionId || !!submittedSearch}
              />
            </Field>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); setPage(0); setSubmittedSearch(filters.search.trim()); }}
            style={{ display: 'grid', gap: 8 }}
          >
            <Input
              placeholder={t('users.searchPlaceholder')}
              icon={<Icon name="search" size={14} />}
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
            />
            <Button type="submit" variant="primary" style={{ width: '100%', justifyContent: 'center' }}>
              {t('users.searchAction')}
            </Button>
            {submittedSearch && (
              <Button
                variant="ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setFilters({ search: '' }); setSubmittedSearch(''); setPage(0); }}
              >
                {t('users.clearSearch')}
              </Button>
            )}
          </form>
        </div>

        {/* Le total vient du SERVEUR : `rows` n'est qu'une page de 30. */}
        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          {t('users.count', { count: usersQ.data?.totalElements ?? rows.length })}
        </div>

        <div className="card" style={{ padding: 0 }}>
          {/* JP 31/07 — cliquer sur une personne ouvre SES engagements du But Quinquennal. */}
          <Table<AdminUserResponse> columns={cols} rows={rows} zebra onRowClick={(r) => setOpenedMember(r)} />
        </div>

        {/* Pagination serveur : sans ces boutons, tout ce qui dépasse la 1re page de 30 est
            inatteignable dès qu'un périmètre compte des milliers de personnes. */}
        {(usersQ.data?.totalPages ?? 1) > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <Button
              variant="secondary"
              disabled={usersQ.data?.first ?? true}
              onClick={() => setPage((n) => Math.max(0, n - 1))}
            >
              {t('users.pagePrev')}
            </Button>
            <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>
              {t('users.pageOf', { page: (usersQ.data?.number ?? 0) + 1, total: usersQ.data?.totalPages ?? 1 })}
            </span>
            <Button
              variant="secondary"
              disabled={usersQ.data?.last ?? true}
              onClick={() => setPage((n) => n + 1)}
            >
              {t('users.pageNext')}
            </Button>
          </div>
        )}
      </div>

      <MemberGoalsModal member={openedMember} onClose={() => setOpenedMember(null)} />

      <InviteModal
        open={inviteOpen}
        onClose={() => { setInviteOpen(false); setInviteResult(null); }}
        me={me}
        units={units}
        zones={zones}
        cities={cities}
        countries={countries}
        people={usersQ.data?.content ?? []}
        result={inviteResult}
        submitting={inviteMutation.isPending}
        onSubmit={(payload) => inviteMutation.mutate({ ...payload, ministryId: me?.ministryId ?? undefined })}
        onCopied={() => push({ kind: 'ok', title: t('users.linkCopied') })}
      />

      <EditModal
        open={editing != null}
        onClose={() => setEditing(null)}
        me={me}
        user={editing}
        units={units}
        zones={zones}
        cities={cities}
        countries={countries}
        people={usersQ.data?.content ?? []}
        submitting={updateMutation.isPending}
        onSubmit={(payload) => editing && updateMutation.mutate({ id: editing.id, ...payload })}
      />

      <Modal
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={t('users.deleteTitle')}
        sub={deleting ? `${deleting.fullName} · ${deleting.email}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting.id)}>
              {deleteMutation.isPending ? t('common.loading') : t('users.confirmDelete')}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--ink-600)' }}>{t('users.deleteWarning')}</p>
      </Modal>
    </>
  );
}

// --------- Champs de périmètre selon le rôle (partagés invite/edit) ---------
// Lot 3.5 : MEMBRE/DIRIGEANT_UNITE = 1 unité ; DIRIGEANT = N unités ; DIRIGEANT_SENIOR = zone (référentiel
// d'adressage pour ses engagements de FOI — sa visibilité « données » vient du sous-arbre) ;
// COORDINATEUR = pays (SUPER_ADMIN) ; LEADER/SECRETARIAT = ministère (pas de rattachement).
/**
 * Engagements d'une personne (JP 31/07) — ouverts en cliquant sur sa ligne.
 *
 * <p>Deux volets quand ils existent : ses engagements PERSONNELS, et l'engagement de l'assemblée
 * qu'elle dirige. Si les deux sont vides, on le DIT explicitement — c'est la demande de JP, pas
 * un écran vide.
 */
function MemberGoalsModal({ member, onClose }: { member: AdminUserResponse | null; onClose: () => void }) {
  const { t } = useTranslation();

  const goalsQ = useQuery({
    queryKey: ['member-goals', member?.id],
    queryFn: () => fetchMemberGoals(member!.id),
    enabled: !!member,
  });
  const activeQ = useQuery({ queryKey: ['goals', 'active'], queryFn: getActiveGoal, enabled: !!member });

  const catByCode = useMemo(
    () => new Map((activeQ.data?.categories ?? []).map((c) => [c.code, c])),
    [activeQ.data],
  );

  const line = (p: PledgeResponse) => {
    const cat = catByCode.get(p.categoryCode);
    const value = p.targetAmount != null
      ? `${p.targetAmount.toLocaleString('fr-FR')} ${activeQ.data?.defaultCurrency ?? ''}`.trim()
      : `${p.targetCount ?? 0}${cat?.unitLabel ? ` ${cat.unitLabel}` : ''}`;
    return (
      <div
        key={p.id}
        style={{
          display: 'flex', justifyContent: 'space-between', gap: 12,
          padding: '7px 0', borderBottom: '1px solid var(--line)',
        }}
      >
        <span style={{ color: 'var(--ink-600)' }}>{cat?.name ?? p.categoryCode}</span>
        <strong style={{ color: 'var(--ink-900)' }}>{value}</strong>
      </div>
    );
  };

  const data: MemberGoalsResponse | undefined = goalsQ.data;
  const empty = !!data && data.memberPledges.length === 0 && data.assemblyPledges.length === 0;
  const forbidden =
    (goalsQ.error as { response?: { status?: number } } | null)?.response?.status === 403;

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title={t('users.goalsTitle', { name: member?.fullName ?? '' })}
      footer={<Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>}
    >
      {goalsQ.isLoading && <p className="section-sub">{t('common.loading')}</p>}
      {goalsQ.isError && (
        <p className="section-sub">{forbidden ? t('users.goalsNoAccess') : t('users.goalsError')}</p>
      )}
      {!goalsQ.isLoading && !goalsQ.isError && empty && (
        <p className="section-sub">{t('users.goalsEmpty')}</p>
      )}
      {!goalsQ.isLoading && !goalsQ.isError && !empty && data && (
        <div style={{ display: 'grid', gap: 18 }}>
          {data.memberPledges.length > 0 && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-500)', marginBottom: 6 }}>{t('users.goalsPersonal')}</div>
              {data.memberPledges.map(line)}
            </div>
          )}
          {data.assemblyPledges.length > 0 && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-500)', marginBottom: 6 }}>
                {t('users.goalsAssembly', { name: data.assemblyName ?? '' })}
              </div>
              {data.assemblyPledges.map(line)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function PerimeterFields({
  role, unitId, unitIds, zoneId, cityId, countryIds, units, zones, cities, countries, set,
}: {
  role: ModuleRole | '';
  unitId: string;
  /** Palier A2 — assemblées SUPPLÉMENTAIRES d'un DIRIGEANT_UNITE (hors « home »). */
  unitIds: string[];
  zoneId: string;
  cityId: string;
  countryIds: string[];
  units: UnitResponse[];
  zones: ZoneResponse[];
  cities: LocalityResponse[];
  countries: CountryResponse[];
  set: (patch: { unitId?: string; unitIds?: string[]; zoneId?: string; cityId?: string; countryIds?: string[] }) => void;
}) {
  const { t } = useTranslation();
  // Recherche en cascade (nation › région › ville) : la liste du niveau visé se filtre
  // au fur et à mesure — un simple <select> devenait illisible à l'échelle du ministère.
  const picker = { units, cities, zones, countries };
  if (role === 'MEMBRE' || role === 'DIRIGEANT_UNITE') {
    return (
      <>
        <Field label={t('users.unitAttachment')} hint={t('users.unitAttachmentHint')}>
          <GeoPicker level="unit" value={unitId} onChange={(id) => set({ unitId: id })} {...picker} />
        </Field>
        {/* Palier A2 (JP 14/08) : un dirigeant d'unité peut en tenir plusieurs. Un MEMBRE non :
            il appartient à une seule assemblée. */}
        {role === 'DIRIGEANT_UNITE' && (
          <ExtraUnitsField
            homeUnitId={unitId}
            unitIds={unitIds}
            units={units}
            onChange={(ids) => set({ unitIds: ids })}
            picker={picker}
          />
        )}
      </>
    );
  }
  if (role === 'DIRIGEANT') {
    // Chantier B (décision #7) : un DIRIGEANT est un dirigeant de VILLE → on le rattache à une Ville.
    return (
      <Field label={t('users.cityAttachment')} hint={t('users.cityAttachmentHint')}>
        <GeoPicker level="city" value={cityId} onChange={(id) => set({ cityId: id })} {...picker} />
      </Field>
    );
  }
  if (role === 'DIRIGEANT_SENIOR') {
    return (
      <Field label={t('users.zoneFaith')} hint={t('users.zoneFaithHint')}>
        <GeoPicker level="zone" value={zoneId} onChange={(id) => set({ zoneId: id })} {...picker} />
      </Field>
    );
  }
  if (role === 'DIRIGEANT_COORDINATEUR') {
    return (
      <Field label={t('users.coordinatedCountries')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {countries.map((c) => {
            const checked = countryIds.includes(c.id);
            return (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => set({ countryIds: e.target.checked ? [...countryIds, c.id] : countryIds.filter((x) => x !== c.id) })}
                />
                {c.name} ({c.code})
              </label>
            );
          })}
        </div>
      </Field>
    );
  }
  // LEADER / SECRETARIAT : vue ministère-large, pas de rattachement géo.
  return null;
}

/**
 * Assemblées supplémentaires d'un dirigeant d'unité (palier A2, JP 14/08).
 *
 * <p>Le sélecteur AJOUTE au lieu de remplacer : la liste des assemblées d'un ministère est bien
 * trop longue pour une liste à cocher, on réutilise donc le GeoPicker en cascade puis on affiche
 * les choix en badges retirables. L'assemblée « home » (au-dessus) reste la principale : c'est
 * elle qui porte la déclaration par défaut, les autres élargissent le périmètre.
 */
function ExtraUnitsField({
  homeUnitId, unitIds, units, onChange, picker,
}: {
  homeUnitId: string;
  unitIds: string[];
  units: UnitResponse[];
  onChange: (ids: string[]) => void;
  picker: { units: UnitResponse[]; cities: LocalityResponse[]; zones: ZoneResponse[]; countries: CountryResponse[] };
}) {
  const { t } = useTranslation();
  const nameOf = (id: string) => units.find((u) => u.id === id)?.name ?? '—';
  const extras = unitIds.filter((id) => id !== homeUnitId);

  return (
    <Field label={t('users.extraUnits')} hint={t('users.extraUnitsHint')}>
      <div style={{ display: 'grid', gap: 8 }}>
        {extras.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {extras.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onChange(extras.filter((x) => x !== id))}
                style={{
                  border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px',
                  background: 'var(--paper-2, #faf7f0)', color: 'var(--ink-600)', cursor: 'pointer',
                  fontSize: 13, fontFamily: 'var(--font-sans)',
                }}
              >
                {nameOf(id)} ✕
              </button>
            ))}
          </div>
        )}
        <GeoPicker
          level="unit"
          value=""
          onChange={(id) => {
            if (id && id !== homeUnitId && !extras.includes(id)) onChange([...extras, id]);
          }}
          {...picker}
        />
      </div>
    </Field>
  );
}

/** Sélecteur de superviseur (organigramme, Lot 3.5) — partagé invite/edit. */
function SupervisorField({
  me, people, value, onChange, excludeId,
}: {
  me: MeResponse | null;
  people: AdminUserResponse[];
  value: string;
  onChange: (id: string) => void;
  excludeId?: string;
}) {
  const { t } = useTranslation();
  return (
    <Field label={t('users.supervisor')} hint={t('users.supervisorHint')}>
      <Picker
        value={value}
        onChange={onChange}
        placeholder={t('common.choose')}
        searchPlaceholder={t('users.supervisor')}
        options={[
          ...(me?.superAdmin ? [{ id: '', label: t('users.supervisorRoot') }] : []),
          ...(me ? [{ id: me.id, label: t('users.supervisorMe', { name: me.fullName }) }] : []),
          // L'email en sous-ligne : deux homonymes ne sont départagés que par lui.
          ...people
            .filter((p) => p.id !== me?.id && p.id !== excludeId)
            .map((p) => ({ id: p.id, label: p.fullName, sub: p.email ?? undefined })),
        ]}
      />
    </Field>
  );
}

/** Construit le rattachement du MODULE choisi (les autres modules ne sont pas touchés). */
function buildAttachment(module: ModuleKind, role: ModuleRole | '', unitId: string, unitIds: string[], zoneId: string, cityId: string, countryIds: string[]) {
  const r = (role || undefined) as ModuleRole | undefined;
  // home unit (action perso). MEMBRE = 1 assemblée ; DIRIGEANT_UNITE = 1..N (A2) ;
  // DIRIGEANT = 1 ville (décision #7).
  let homeUnit: string | undefined;
  let unitSet: string[] | undefined;
  if (role === 'MEMBRE') {
    homeUnit = unitId || undefined;
  } else if (role === 'DIRIGEANT_UNITE') {
    homeUnit = unitId || undefined;
    // La « home » ouvre toujours le set : le backend traite `goalUnitIds` comme le périmètre complet.
    unitSet = unitId ? [unitId, ...unitIds.filter((id) => id !== unitId)] : [];
  } else if (role === 'DIRIGEANT') {
    // DIRIGEANT = dirigeant de ville : rattachement à une VILLE ; on purge les unités héritées.
    unitSet = [];
  }
  const city = role === 'DIRIGEANT' ? cityId || undefined : undefined;
  const zone = role === 'DIRIGEANT_SENIOR' ? zoneId || undefined : undefined;
  const cIds = role === 'DIRIGEANT_COORDINATEUR' ? countryIds : undefined;
  if (module === 'goal') {
    return { goalRole: r, goalUnitId: homeUnit, goalUnitIds: unitSet, goalZoneId: zone, goalCityId: city, goalCountryIds: cIds };
  }
  return { donationRole: r, donationUnitId: homeUnit, donationUnitIds: unitSet, donationZoneId: zone, donationCityId: city, donationCountryIds: cIds };
}

/** Sélecteur de module (affiché seulement si plusieurs modules sont visibles). */
function ModuleField({ module, onChange }: { module: ModuleKind; onChange: (m: ModuleKind) => void }) {
  const { t } = useTranslation();
  const moduleLabel = (m: ModuleKind) => t(m === 'goal' ? 'users.moduleGoals' : 'users.moduleDonations');
  if (VISIBLE_MODULES.length < 2) return null;
  return (
    <Field label={t('users.module')}>
      <Picker
        value={module}
        onChange={(m) => onChange(m as ModuleKind)}
        placeholder={t('common.choose')}
        options={VISIBLE_MODULES.map((m) => ({ id: m, label: moduleLabel(m) }))}
      />
    </Field>
  );
}

function perimeterValid(role: ModuleRole | '', unitId: string, zoneId: string, cityId: string, countryIds: string[]) {
  if (role === 'MEMBRE' || role === 'DIRIGEANT_UNITE') return unitId !== '';
  if (role === 'DIRIGEANT') return cityId !== '';
  if (role === 'DIRIGEANT_SENIOR') return zoneId !== '';
  if (role === 'DIRIGEANT_COORDINATEUR') return countryIds.length > 0;
  return role !== ''; // LEADER / SECRETARIAT
}

function InviteModal({
  open, onClose, me, units, zones, cities, countries, people, result, submitting, onSubmit, onCopied,
}: {
  open: boolean;
  onClose: () => void;
  me: MeResponse | null;
  units: UnitResponse[];
  zones: ZoneResponse[];
  cities: LocalityResponse[];
  countries: CountryResponse[];
  people: AdminUserResponse[];
  result: { email: string; link: string; code: string | null } | null;
  submitting: boolean;
  onSubmit: (payload: InviteUserRequest) => void;
  onCopied: () => void;
}) {
  const { t } = useTranslation();
  const moduleLabel = (m: ModuleKind) => t(m === 'goal' ? 'users.moduleGoals' : 'users.moduleDonations');
  const defaultSupervisor = me && !me.superAdmin ? me.id : '';
  const [module, setModule] = useState<ModuleKind>(VISIBLE_MODULES[0]);
  const [email, setEmail] = useState('');
  // A1 (RG-ID-01) — identifiant de connexion attribué (email désormais facultatif).
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<ModuleRole | ''>('');
  const [unitId, setUnitId] = useState('');
  // Palier A2 — assemblées supplémentaires d'un DIRIGEANT_UNITE (« home » exclue).
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [cityId, setCityId] = useState('');
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [supervisorId, setSupervisorId] = useState('');

  useEffect(() => {
    if (open) {
      setModule(VISIBLE_MODULES[0]); setEmail(''); setUsername(''); setFullName(''); setRole('');
      setUnitId(''); setUnitIds([]); setZoneId(''); setCityId(''); setCountryIds([]); setSupervisorId(defaultSupervisor);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // A1 (RG-ID-02) : identifiant OU email requis (au moins un).
  const valid = (username.includes('@') || email.includes('@'))
    && fullName.trim().length > 0 && perimeterValid(role, unitId, zoneId, cityId, countryIds);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result ? t('users.invitationReady') : t('users.invite')}
      sub={result ? t('users.shareLink') : t('users.inviteSub')}
      size="lg"
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>{t('common.done')}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={!valid || submitting}
              onClick={() => onSubmit({
                email: email.trim() || undefined,
                username: username.trim() || undefined,
                fullName: fullName.trim(),
                supervisorId: supervisorId || undefined,
                ...buildAttachment(module, role, unitId, unitIds, zoneId, cityId, countryIds),
              })}
            >
              {submitting ? t('users.creating') : t('users.generateInvitation')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={t('users.invitationLink')} hint={t('users.invitationLinkHint', { email: result.email })}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={result.link} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
              <Button variant="secondary" iconL={<Icon name="copy" size={14} />} onClick={() => { navigator.clipboard?.writeText(result.link); onCopied(); }}>
                {t('common.copy')}
              </Button>
            </div>
          </Field>
          {result.code && (
            <Field label={t('users.activationCode')} hint={t('users.activationCodeHint')}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={result.code} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: 18, letterSpacing: 2, fontWeight: 700 }} />
                <Button variant="secondary" iconL={<Icon name="copy" size={14} />} onClick={() => { navigator.clipboard?.writeText(result.code!); onCopied(); }}>
                  {t('common.copy')}
                </Button>
              </div>
            </Field>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Field label={t('users.fullName')}><Input placeholder={t('users.fullNamePlaceholder')} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label={t('users.usernameLabel')} hint={t('users.usernameHint')}><Input placeholder={t('users.usernamePlaceholder')} value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
            <Field label={t('users.emailOptionalLabel')}><Input type="email" placeholder={t('users.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} icon={<Icon name="mail" size={14} />} /></Field>
          </div>
          <SupervisorField me={me} people={people} value={supervisorId} onChange={setSupervisorId} />
          <ModuleField module={module} onChange={(m) => { setModule(m); setRole(''); setUnitId(''); setUnitIds([]); setZoneId(''); setCityId(''); setCountryIds([]); }} />
          <Field label={t('users.roleConferred', { module: moduleLabel(module) })}>
            <Picker
              value={role}
              onChange={(r) => { setRole(r as ModuleRole | ''); setUnitId(''); setUnitIds([]); setZoneId(''); setCityId(''); setCountryIds([]); }}
              placeholder={t('common.choose')}
              options={conferrableRoles(me, module).map((r) => ({ id: r, label: t(`roles.${r}`) }))}
            />
          </Field>
          <PerimeterFields role={role} unitId={unitId} unitIds={unitIds} zoneId={zoneId} cityId={cityId} countryIds={countryIds} units={units} zones={zones} cities={cities} countries={countries}
            set={(p) => { if (p.unitId !== undefined) setUnitId(p.unitId); if (p.unitIds !== undefined) setUnitIds(p.unitIds); if (p.zoneId !== undefined) setZoneId(p.zoneId); if (p.cityId !== undefined) setCityId(p.cityId); if (p.countryIds !== undefined) setCountryIds(p.countryIds); }} />
        </div>
      )}
    </Modal>
  );
}

function EditModal({
  open, onClose, me, user, units, zones, cities, countries, people, submitting, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  me: MeResponse | null;
  user: AdminUserResponse | null;
  units: UnitResponse[];
  zones: ZoneResponse[];
  cities: LocalityResponse[];
  countries: CountryResponse[];
  people: AdminUserResponse[];
  submitting: boolean;
  onSubmit: (payload: UpdateUserRequest) => void;
}) {
  const { t } = useTranslation();
  const moduleLabel = (m: ModuleKind) => t(m === 'goal' ? 'users.moduleGoals' : 'users.moduleDonations');
  const [module, setModule] = useState<ModuleKind>(VISIBLE_MODULES[0]);
  const [role, setRole] = useState<ModuleRole | ''>('');
  const [unitId, setUnitId] = useState('');
  // Palier A2 — assemblées supplémentaires d'un DIRIGEANT_UNITE (« home » exclue).
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [cityId, setCityId] = useState('');
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [active, setActive] = useState(true);
  // Lot 4.8 — pays coordonnés (SECRETARIAT/LEADER), transverse, réservé SUPER_ADMIN.
  const [coordinatedCountryIds, setCoordinatedCountryIds] = useState<string[]>([]);

  // (Ré)initialise les champs depuis le rattachement du module sélectionné.
  const initFromUser = (u: AdminUserResponse, m: ModuleKind) => {
    setRole((roleOf(u, m) ?? '') as ModuleRole | '');
    setUnitId(unitIdOf(u, m) ?? '');
    setUnitIds(extraUnitIdsOf(u, m));
    setZoneId(zoneIdOf(u, m) ?? '');
    setCityId(cityIdOf(u, m) ?? '');
    setCountryIds(countryIdsOf(u, m) ?? []);
  };

  useEffect(() => {
    if (open && user) {
      setModule(VISIBLE_MODULES[0]);
      initFromUser(user, VISIBLE_MODULES[0]);
      setSupervisorId(user.supervisorId ?? ''); // superviseur = transverse (pas par module)
      setActive(user.active);
      setCoordinatedCountryIds(user.coordinatedCountryIds ?? []);
    }
  }, [open, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const showCoordinated = (me?.superAdmin ?? false) && (role === 'SECRETARIAT' || role === 'LEADER');

  const valid = perimeterValid(role, unitId, zoneId, cityId, countryIds);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? t('users.manageUser', { name: user.fullName }) : t('users.manageDefault')}
      sub={t('users.manageSub')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid || submitting} onClick={() => onSubmit({
            supervisorId: supervisorId || undefined,
            ...buildAttachment(module, role, unitId, unitIds, zoneId, cityId, countryIds),
            ...(me?.superAdmin ? { coordinatedCountryIds: showCoordinated ? coordinatedCountryIds : [] } : {}),
            active,
          })}>
            {submitting ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SupervisorField me={me} people={people} value={supervisorId} onChange={setSupervisorId} excludeId={user?.id} />
        <ModuleField module={module} onChange={(m) => { setModule(m); if (user) initFromUser(user, m); }} />
        <Field label={t('users.roleConferred', { module: moduleLabel(module) })}>
          <Picker
            value={role}
            onChange={(r) => { setRole(r as ModuleRole | ''); setUnitId(''); setUnitIds([]); setZoneId(''); setCityId(''); setCountryIds([]); }}
            placeholder={t('common.noneOption')}
            options={[
              // Retrait du rôle : choix explicite, pas seulement un placeholder.
              { id: '', label: t('common.noneOption') },
              ...conferrableRoles(me, module).map((r) => ({ id: r, label: t(`roles.${r}`) })),
            ]}
          />
        </Field>
        <PerimeterFields role={role} unitId={unitId} unitIds={unitIds} zoneId={zoneId} cityId={cityId} countryIds={countryIds} units={units} zones={zones} cities={cities} countries={countries}
          set={(p) => { if (p.unitId !== undefined) setUnitId(p.unitId); if (p.unitIds !== undefined) setUnitIds(p.unitIds); if (p.zoneId !== undefined) setZoneId(p.zoneId); if (p.cityId !== undefined) setCityId(p.cityId); if (p.countryIds !== undefined) setCountryIds(p.countryIds); }} />
        {showCoordinated && (
          <Field label={t('users.coordinatedCountriesNation')} hint={t('users.coordinatedCountriesHint')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {countries.map((c) => {
                const checked = coordinatedCountryIds.includes(c.id);
                return (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setCoordinatedCountryIds(
                          e.target.checked
                            ? [...coordinatedCountryIds, c.id]
                            : coordinatedCountryIds.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                );
              })}
              {countries.length === 0 && (
                <span style={{ color: 'var(--ink-400)', fontStyle: 'italic', fontSize: 13 }}>{t('users.noCountry')}</span>
              )}
            </div>
          </Field>
        )}
        <Field label={t('common.status')}>
          <Toggle checked={active} onChange={setActive} label={active ? t('users.statusActive') : t('users.statusInactive')} />
        </Field>
      </div>
    </Modal>
  );
}
