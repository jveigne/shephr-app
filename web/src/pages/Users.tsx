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
import {
  assignableRoles,
  canManageUsers,
  type MeResponse,
  type ModuleRole,
} from '../services/authApi';
import {
  inviteUser,
  listCountries,
  listUnits,
  listUsers,
  listZones,
  updateUser,
  type AdminUserResponse,
  type CountryResponse,
  type InviteUserRequest,
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
const zoneIdOf = (u: AdminUserResponse, m: ModuleKind) => (m === 'goal' ? u.goalZoneId : u.donationZoneId);
const countryIdsOf = (u: AdminUserResponse, m: ModuleKind) =>
  m === 'goal' ? u.goalCountryIds : u.donationCountryIds;

type Filters = { role: ModuleRole | 'all'; active: 'all' | 'true' | 'false'; search: string };
const DEFAULT: Filters = { role: 'all', active: 'all', search: '' };

const ROLE_FILTER_OPTIONS: ModuleRole[] = [
  'MEMBRE', 'DIRIGEANT_UNITE', 'DIRIGEANT', 'DIRIGEANT_SENIOR', 'DIRIGEANT_COORDINATEUR', 'LEADER', 'SECRETARIAT',
];

export function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { me } = useAuth();
  const canWrite = canManageUsers(me);
  const moduleLabel = (m: ModuleKind) => t(m === 'goal' ? 'users.moduleGoals' : 'users.moduleDonations');

  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserResponse | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; link: string; code: string | null } | null>(null);

  const unitsQ = useQuery({ queryKey: ['admin', 'units'], queryFn: () => listUnits() });
  const zonesQ = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => listZones() });
  const countriesQ = useQuery({ queryKey: ['admin', 'countries'], queryFn: listCountries });

  const usersQ = useQuery({
    queryKey: ['admin', 'users', filters.active],
    queryFn: () =>
      listUsers({
        // Le filtre rôle est appliqué côté client, tous modules visibles confondus
        // (le backend ne sait filtrer que donationRole).
        active: filters.active === 'all' ? undefined : filters.active === 'true',
        size: 200,
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

  const units = unitsQ.data ?? [];
  const zones = zonesQ.data ?? [];
  const countries = countriesQ.data ?? [];
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? (id ? '…' : null);
  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? (id ? '…' : null);

  const rows = useMemo(() => {
    let all = usersQ.data?.content ?? [];
    if (filters.role !== 'all') {
      all = all.filter((r) => VISIBLE_MODULES.some((m) => roleOf(r, m) === filters.role));
    }
    if (!filters.search) return all;
    const q = filters.search.toLowerCase();
    return all.filter((r) => `${r.fullName} ${r.email}`.toLowerCase().includes(q));
  }, [usersQ.data, filters.search, filters.role]);

  const perimeterLabel = (u: AdminUserResponse, m: ModuleKind): string => {
    const cIds = countryIdsOf(u, m);
    if (cIds?.length) return countries.filter((c) => cIds.includes(c.id)).map((c) => c.name).join(', ') || t('users.perimeterCountry');
    if (zoneIdOf(u, m)) return t('users.perimeterZone', { name: zoneName(zoneIdOf(u, m)) });
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
            <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{r.email}</div>
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
              <div className="row-actions">
                <IconButton icon={<Icon name="edit" size={15} />} title={t('users.manage')} onClick={() => setEditing(r)} />
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
        actions={
          canWrite ? (
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

        <div className="filters">
          <Field label={t('common.searchLabel')} style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder={t('users.searchPlaceholder')}
              icon={<Icon name="search" size={14} />}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </Field>
          <Field label={t('users.roleFilter')}>
            <Select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value as Filters['role'] })}>
              <option value="all">{t('common.all')}</option>
              {ROLE_FILTER_OPTIONS.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('common.status')}>
            <Select value={filters.active} onChange={(e) => setFilters({ ...filters, active: e.target.value as Filters['active'] })}>
              <option value="all">{t('common.all')}</option>
              <option value="true">{t('common.active')}</option>
              <option value="false">{t('common.inactive')}</option>
            </Select>
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          {t('users.count', { count: rows.length })}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<AdminUserResponse> columns={cols} rows={rows} zebra />
        </div>
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => { setInviteOpen(false); setInviteResult(null); }}
        me={me}
        units={units}
        zones={zones}
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
        countries={countries}
        people={usersQ.data?.content ?? []}
        submitting={updateMutation.isPending}
        onSubmit={(payload) => editing && updateMutation.mutate({ id: editing.id, ...payload })}
      />
    </>
  );
}

// --------- Champs de périmètre selon le rôle (partagés invite/edit) ---------
// Lot 3.5 : MEMBRE/DIRIGEANT_UNITE = 1 unité ; DIRIGEANT = N unités ; DIRIGEANT_SENIOR = zone (référentiel
// d'adressage pour ses engagements de FOI — sa visibilité « données » vient du sous-arbre) ;
// COORDINATEUR = pays (SUPER_ADMIN) ; LEADER/SECRETARIAT = ministère (pas de rattachement).
function PerimeterFields({
  role, unitId, unitIds, zoneId, countryIds, units, zones, countries, set,
}: {
  role: ModuleRole | '';
  unitId: string;
  unitIds: string[];
  zoneId: string;
  countryIds: string[];
  units: UnitResponse[];
  zones: ZoneResponse[];
  countries: CountryResponse[];
  set: (patch: { unitId?: string; unitIds?: string[]; zoneId?: string; countryIds?: string[] }) => void;
}) {
  const { t } = useTranslation();
  if (role === 'MEMBRE' || role === 'DIRIGEANT_UNITE') {
    return (
      <Field label={t('users.unitAttachment')}>
        <Select value={unitId} onChange={(e) => set({ unitId: e.target.value })}>
          <option value="">{t('common.choose')}</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
    );
  }
  if (role === 'DIRIGEANT') {
    return (
      <Field label={t('users.managedUnits')} hint={t('users.managedUnitsHint')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {units.map((u) => {
            const checked = unitIds.includes(u.id);
            return (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => set({ unitIds: e.target.checked ? [...unitIds, u.id] : unitIds.filter((x) => x !== u.id) })}
                />
                {u.name}
              </label>
            );
          })}
        </div>
      </Field>
    );
  }
  if (role === 'DIRIGEANT_SENIOR') {
    return (
      <Field label={t('users.zoneFaith')}
        hint={t('users.zoneFaithHint')}>
        <Select value={zoneId} onChange={(e) => set({ zoneId: e.target.value })}>
          <option value="">{t('common.choose')}</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {z.countryName}</option>)}
        </Select>
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
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {me?.superAdmin && <option value="">{t('users.supervisorRoot')}</option>}
        {me && <option value={me.id}>{t('users.supervisorMe', { name: me.fullName })}</option>}
        {people
          .filter((p) => p.id !== me?.id && p.id !== excludeId)
          .map((p) => (
            <option key={p.id} value={p.id}>{p.fullName} — {p.email}</option>
          ))}
      </Select>
    </Field>
  );
}

/** Construit le rattachement du MODULE choisi (les autres modules ne sont pas touchés). */
function buildAttachment(module: ModuleKind, role: ModuleRole | '', unitId: string, unitIds: string[], zoneId: string, countryIds: string[]) {
  const r = (role || undefined) as ModuleRole | undefined;
  // home unit (action perso) + set d'unités gérées (visibilité). DIRIGEANT = N unités (home = 1ère).
  let homeUnit: string | undefined;
  let unitSet: string[] | undefined;
  if (role === 'MEMBRE' || role === 'DIRIGEANT_UNITE') {
    homeUnit = unitId || undefined;
  } else if (role === 'DIRIGEANT') {
    unitSet = unitIds;
    homeUnit = unitIds[0];
  }
  const zone = role === 'DIRIGEANT_SENIOR' ? zoneId || undefined : undefined;
  const cIds = role === 'DIRIGEANT_COORDINATEUR' ? countryIds : undefined;
  if (module === 'goal') {
    return { goalRole: r, goalUnitId: homeUnit, goalUnitIds: unitSet, goalZoneId: zone, goalCountryIds: cIds };
  }
  return { donationRole: r, donationUnitId: homeUnit, donationUnitIds: unitSet, donationZoneId: zone, donationCountryIds: cIds };
}

/** Sélecteur de module (affiché seulement si plusieurs modules sont visibles). */
function ModuleField({ module, onChange }: { module: ModuleKind; onChange: (m: ModuleKind) => void }) {
  const { t } = useTranslation();
  const moduleLabel = (m: ModuleKind) => t(m === 'goal' ? 'users.moduleGoals' : 'users.moduleDonations');
  if (VISIBLE_MODULES.length < 2) return null;
  return (
    <Field label={t('users.module')}>
      <Select value={module} onChange={(e) => onChange(e.target.value as ModuleKind)}>
        {VISIBLE_MODULES.map((m) => (
          <option key={m} value={m}>{moduleLabel(m)}</option>
        ))}
      </Select>
    </Field>
  );
}

function perimeterValid(role: ModuleRole | '', unitId: string, unitIds: string[], zoneId: string, countryIds: string[]) {
  if (role === 'MEMBRE' || role === 'DIRIGEANT_UNITE') return unitId !== '';
  if (role === 'DIRIGEANT') return unitIds.length > 0;
  if (role === 'DIRIGEANT_SENIOR') return zoneId !== '';
  if (role === 'DIRIGEANT_COORDINATEUR') return countryIds.length > 0;
  return role !== ''; // LEADER / SECRETARIAT
}

function InviteModal({
  open, onClose, me, units, zones, countries, people, result, submitting, onSubmit, onCopied,
}: {
  open: boolean;
  onClose: () => void;
  me: MeResponse | null;
  units: UnitResponse[];
  zones: ZoneResponse[];
  countries: CountryResponse[];
  people: AdminUserResponse[];
  result: { email: string; link: string; code: string | null } | null;
  submitting: boolean;
  onSubmit: (payload: InviteUserRequest) => void;
  onCopied: () => void;
}) {
  const { t } = useTranslation();
  const moduleLabel = (m: ModuleKind) => t(m === 'goal' ? 'users.moduleGoals' : 'users.moduleDonations');
  const roles = assignableRoles(me);
  const defaultSupervisor = me && !me.superAdmin ? me.id : '';
  const [module, setModule] = useState<ModuleKind>(VISIBLE_MODULES[0]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<ModuleRole | ''>('');
  const [unitId, setUnitId] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [supervisorId, setSupervisorId] = useState('');

  useEffect(() => {
    if (open) {
      setModule(VISIBLE_MODULES[0]); setEmail(''); setFullName(''); setRole('');
      setUnitId(''); setUnitIds([]); setZoneId(''); setCountryIds([]); setSupervisorId(defaultSupervisor);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = email.includes('@') && fullName.trim().length > 0 && perimeterValid(role, unitId, unitIds, zoneId, countryIds);

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
                email: email.trim(), fullName: fullName.trim(),
                supervisorId: supervisorId || undefined,
                ...buildAttachment(module, role, unitId, unitIds, zoneId, countryIds),
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label={t('users.fullName')}><Input placeholder={t('users.fullNamePlaceholder')} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <Field label={t('users.emailLabel')}><Input type="email" placeholder={t('users.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} icon={<Icon name="mail" size={14} />} /></Field>
          </div>
          <SupervisorField me={me} people={people} value={supervisorId} onChange={setSupervisorId} />
          <ModuleField module={module} onChange={(m) => { setModule(m); setRole(''); setUnitId(''); setUnitIds([]); setZoneId(''); setCountryIds([]); }} />
          <Field label={t('users.roleConferred', { module: moduleLabel(module) })}>
            <Select value={role} onChange={(e) => { setRole(e.target.value as ModuleRole | ''); setUnitId(''); setUnitIds([]); setZoneId(''); setCountryIds([]); }}>
              <option value="">{t('common.choose')}</option>
              {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </Select>
          </Field>
          <PerimeterFields role={role} unitId={unitId} unitIds={unitIds} zoneId={zoneId} countryIds={countryIds} units={units} zones={zones} countries={countries}
            set={(p) => { if (p.unitId !== undefined) setUnitId(p.unitId); if (p.unitIds !== undefined) setUnitIds(p.unitIds); if (p.zoneId !== undefined) setZoneId(p.zoneId); if (p.countryIds !== undefined) setCountryIds(p.countryIds); }} />
        </div>
      )}
    </Modal>
  );
}

function EditModal({
  open, onClose, me, user, units, zones, countries, people, submitting, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  me: MeResponse | null;
  user: AdminUserResponse | null;
  units: UnitResponse[];
  zones: ZoneResponse[];
  countries: CountryResponse[];
  people: AdminUserResponse[];
  submitting: boolean;
  onSubmit: (payload: UpdateUserRequest) => void;
}) {
  const { t } = useTranslation();
  const moduleLabel = (m: ModuleKind) => t(m === 'goal' ? 'users.moduleGoals' : 'users.moduleDonations');
  const roles = assignableRoles(me);
  const [module, setModule] = useState<ModuleKind>(VISIBLE_MODULES[0]);
  const [role, setRole] = useState<ModuleRole | ''>('');
  const [unitId, setUnitId] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [active, setActive] = useState(true);
  // Lot 4.8 — pays coordonnés (SECRETARIAT/LEADER), transverse, réservé SUPER_ADMIN.
  const [coordinatedCountryIds, setCoordinatedCountryIds] = useState<string[]>([]);

  // (Ré)initialise les champs depuis le rattachement du module sélectionné.
  const initFromUser = (u: AdminUserResponse, m: ModuleKind) => {
    setRole((roleOf(u, m) ?? '') as ModuleRole | '');
    setUnitId(unitIdOf(u, m) ?? '');
    setUnitIds((m === 'goal' ? u.goalUnitIds : u.donationUnitIds) ?? []);
    setZoneId(zoneIdOf(u, m) ?? '');
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

  const valid = perimeterValid(role, unitId, unitIds, zoneId, countryIds);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? t('users.manageUser', { name: user.fullName }) : t('users.manageDefault')}
      sub={t('users.manageSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid || submitting} onClick={() => onSubmit({
            supervisorId: supervisorId || undefined,
            ...buildAttachment(module, role, unitId, unitIds, zoneId, countryIds),
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
          <Select value={role} onChange={(e) => { setRole(e.target.value as ModuleRole | ''); setUnitId(''); setUnitIds([]); setZoneId(''); setCountryIds([]); }}>
            <option value="">{t('common.noneOption')}</option>
            {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </Select>
        </Field>
        <PerimeterFields role={role} unitId={unitId} unitIds={unitIds} zoneId={zoneId} countryIds={countryIds} units={units} zones={zones} countries={countries}
          set={(p) => { if (p.unitId !== undefined) setUnitId(p.unitId); if (p.unitIds !== undefined) setUnitIds(p.unitIds); if (p.zoneId !== undefined) setZoneId(p.zoneId); if (p.countryIds !== undefined) setCountryIds(p.countryIds); }} />
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
