import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  RoleBadge,
  Select,
  StatusBadge,
  Table,
  TopBar,
  type Column,
} from '../components/ui';
import { useToast } from '../components/Toast';
import {
  inviteUser,
  listUsers,
  type AdminUserResponse,
  type InviteUserRequest,
} from '../services/adminApi';
import { listUnits } from '../services/adminApi';
import type { UserRole } from '../services/authApi';

type Filters = {
  role: UserRole | 'all';
  unitId: string | 'all';
  active: 'all' | 'true' | 'false';
  search: string;
};

const DEFAULT: Filters = { role: 'all', unitId: 'all', active: 'all', search: '' };

export function UsersPage() {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ email: string; link: string } | null>(null);

  const unitsQ = useQuery({ queryKey: ['admin', 'units'], queryFn: listUnits });

  const usersQ = useQuery({
    queryKey: [
      'admin',
      'users',
      filters.role,
      filters.unitId,
      filters.active,
    ],
    queryFn: () =>
      listUsers({
        role: filters.role === 'all' ? undefined : filters.role,
        unitId: filters.unitId === 'all' ? undefined : filters.unitId,
        active: filters.active === 'all' ? undefined : filters.active === 'true',
        size: 100,
      }),
  });

  const rows = useMemo(() => {
    const all = usersQ.data?.content ?? [];
    if (!filters.search) return all;
    const q = filters.search.toLowerCase();
    return all.filter((r) => `${r.fullName} ${r.email}`.toLowerCase().includes(q));
  }, [usersQ.data, filters.search]);

  const inviteMutation = useMutation({
    mutationFn: (payload: InviteUserRequest) => inviteUser(payload),
    onSuccess: (data) => {
      setInviteResult({ email: data.email, link: data.invitationLink });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Création impossible.';
      push({ kind: 'error', title: 'Invitation refusée', msg: message });
    },
  });

  const cols: Column<AdminUserResponse>[] = [
    {
      label: 'Nom',
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
    { label: 'Rôle', render: (r) => <RoleBadge role={r.role} /> },
    {
      label: 'Niveau',
      render: (r) =>
        r.leaderLevel ? (
          <Badge tone={r.leaderLevel === 'SENIOR' ? 'green' : 'earth'}>
            {r.leaderLevel === 'SENIOR' ? 'Senior' : 'Junior'}
          </Badge>
        ) : (
          <span style={{ color: 'var(--ink-400)' }}>—</span>
        ),
    },
    { label: 'Unité', render: (r) => r.unitName ?? '—' },
    { label: 'Ministère', render: (r) => r.ministryName ?? '—' },
    { label: 'Statut', render: (r) => <StatusBadge active={r.active} /> },
    {
      label: 'Créé le',
      render: (r) => (
        <span style={{ color: 'var(--ink-500)' }}>
          {new Date(r.createdAt).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
    {
      label: '',
      style: { width: 90 },
      render: () => (
        <div className="row-actions">
          <IconButton icon={<Icon name="edit" size={15} />} title="Modifier" />
          <IconButton icon={<Icon name="more" size={15} />} title="Plus" />
        </div>
      ),
    },
  ];

  return (
    <>
      <TopBar
        title="Utilisateurs"
        crumbs={['shephr', 'Utilisateurs']}
        actions={
          <Button
            variant="primary"
            iconL={<Icon name="plus" size={15} />}
            onClick={() => setInviteOpen(true)}
          >
            Inviter un utilisateur
          </Button>
        }
      />

      <div className="content">
        <p className="section-sub">
          Membres, dirigeants et administrateurs. Les invitations sont envoyées par lien partageable.
        </p>

        <div className="filters">
          <Field label="Recherche" style={{ minWidth: 260, flex: 1 }}>
            <Input
              placeholder="Nom ou email…"
              icon={<Icon name="search" size={14} />}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </Field>
          <Field label="Rôle">
            <Select
              value={filters.role}
              onChange={(e) =>
                setFilters({ ...filters, role: e.target.value as Filters['role'] })
              }
            >
              <option value="all">Tous</option>
              <option value="MEMBER">Membre</option>
              <option value="LEADER">Dirigeant</option>
              <option value="ADMIN">Administrateur</option>
            </Select>
          </Field>
          <Field label="Unité">
            <Select
              value={filters.unitId}
              onChange={(e) => setFilters({ ...filters, unitId: e.target.value })}
            >
              <option value="all">Toutes</option>
              {(unitsQ.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Statut">
            <Select
              value={filters.active}
              onChange={(e) =>
                setFilters({ ...filters, active: e.target.value as Filters['active'] })
              }
            >
              <option value="all">Tous</option>
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </Select>
          </Field>
        </div>

        <div style={{ color: 'var(--ink-500)', fontSize: 13, marginBottom: 10 }}>
          <strong style={{ color: 'var(--ink-800)' }}>{rows.length}</strong> utilisateurs ·{' '}
          {rows.filter((r) => r.role === 'LEADER').length} dirigeants,{' '}
          {rows.filter((r) => r.role === 'MEMBER').length} membres,{' '}
          {rows.filter((r) => r.role === 'ADMIN').length} administrateur(s)
        </div>

        <div className="card" style={{ padding: 0 }}>
          <Table<AdminUserResponse> columns={cols} rows={rows} zebra />
        </div>
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteResult(null);
        }}
        units={unitsQ.data ?? []}
        result={inviteResult}
        submitting={inviteMutation.isPending}
        onSubmit={(payload) => inviteMutation.mutate(payload)}
        onCopied={() => push({ kind: 'ok', title: 'Lien copié' })}
      />
    </>
  );
}

interface UnitLite {
  id: string;
  name: string;
}

function InviteModal({
  open,
  onClose,
  units,
  result,
  submitting,
  onSubmit,
  onCopied,
}: {
  open: boolean;
  onClose: () => void;
  units: UnitLite[];
  result: { email: string; link: string } | null;
  submitting: boolean;
  onSubmit: (payload: InviteUserRequest) => void;
  onCopied: () => void;
}) {
  const [form, setForm] = useState<{
    email: string;
    fullName: string;
    role: UserRole;
    level: 'JUNIOR' | 'SENIOR';
    unitId: string;
  }>({ email: '', fullName: '', role: 'MEMBER', level: 'JUNIOR', unitId: units[0]?.id ?? '' });

  const valid = form.email.includes('@') && form.fullName.trim().length > 0;

  const submit = () => {
    onSubmit({
      email: form.email.trim(),
      fullName: form.fullName.trim(),
      role: form.role,
      leaderLevel: form.role === 'LEADER' ? form.level : undefined,
      unitId: form.role === 'ADMIN' ? undefined : form.unitId || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result ? 'Invitation prête' : 'Inviter un utilisateur'}
      sub={
        result
          ? 'Partagez ce lien avec la personne invitée.'
          : "Saisissez les informations et le rôle dans l'organisation."
      }
      size="lg"
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Terminé
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="primary" onClick={submit} disabled={!valid || submitting}>
              {submitting ? 'Création…' : "Générer l'invitation"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            className="stat-row"
            style={{ background: 'var(--green-50)', borderColor: 'rgba(42,81,66,.18)' }}
          >
            <div
              className="icon-wrap"
              style={{ background: 'var(--green-700)', color: '#FBF5E4' }}
            >
              <Icon name="check" size={18} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--green-800)' }}>
                Invitation créée pour {form.fullName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{result.email}</div>
            </div>
          </div>
          <Field label="Lien d'invitation" hint="Partagez ce lien avec la personne invitée.">
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={result.link}
                readOnly
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
              <Button
                variant="secondary"
                iconL={<Icon name="copy" size={14} />}
                onClick={() => {
                  navigator.clipboard?.writeText(result.link);
                  onCopied();
                }}
              >
                Copier
              </Button>
            </div>
          </Field>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nom complet">
              <Input
                placeholder="Prénom Nom"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </Field>
            <Field label="Adresse e-mail">
              <Input
                type="email"
                placeholder="email@exemple.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                icon={<Icon name="mail" size={14} />}
              />
            </Field>
          </div>

          <Field label="Rôle dans l'organisation">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { v: 'MEMBER' as const, t: 'Membre', d: 'Déclare ses propres dons.' },
                { v: 'LEADER' as const, t: 'Dirigeant', d: 'Encadre une unité.' },
                { v: 'ADMIN' as const, t: 'Administrateur', d: 'Accès complet web.' },
              ].map((r) => (
                <button
                  key={r.v}
                  type="button"
                  onClick={() => setForm({ ...form, role: r.v })}
                  style={{
                    padding: '12px 14px',
                    border:
                      form.role === r.v
                        ? '1px solid var(--green-700)'
                        : '1px solid var(--line)',
                    background: form.role === r.v ? 'var(--green-50)' : 'var(--ivory-raised)',
                    borderRadius: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--green-800)' }}>
                    {r.t}
                  </div>
                  <div
                    style={{ fontSize: 11.5, color: 'var(--ink-500)', marginTop: 2, lineHeight: 1.35 }}
                  >
                    {r.d}
                  </div>
                </button>
              ))}
            </div>
          </Field>

          {form.role === 'LEADER' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Niveau">
                <Select
                  value={form.level}
                  onChange={(e) =>
                    setForm({ ...form, level: e.target.value as 'JUNIOR' | 'SENIOR' })
                  }
                >
                  <option value="SENIOR">Senior</option>
                  <option value="JUNIOR">Junior</option>
                </Select>
              </Field>
              <Field label="Unité encadrée">
                <Select
                  value={form.unitId}
                  onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {form.role === 'MEMBER' && (
            <Field label="Unité de rattachement">
              <Select
                value={form.unitId}
                onChange={(e) => setForm({ ...form, unitId: e.target.value })}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
