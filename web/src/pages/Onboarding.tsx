import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Badge, Button, Field, Input, Picker, type PickerOption } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { hasMemberSpace, hasMinistryAccess } from '../services/authApi';
import { fetchRequestContext, type RequestNodeOption } from '../services/structureRequestsApi';
import {
  cancelJoinRequest,
  createJoinRequest,
  listMyJoinRequests,
  searchAssemblies,
  type AssemblyOption,
  type JoinRequestResponse,
  type JoinRequestRole,
  type JoinRequestStatus,
} from '../services/joinRequestsApi';

// Feature B — onboarding /join : un utilisateur AUTHENTIFIÉ mais sans rattachement cherche son
// assemblée (recherche + drill nation→région→ville), choisit son rôle, ou demande la création
// de son assemblée, puis suit sa demande (validée par le dirigeant de l'assemblée ou le secrétariat).

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const errCode = (err: unknown): string | null =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;

/** Nœuds de structure → options du Picker (l'ordre du backend est conservé). */
const toOptions = (nodes: RequestNodeOption[] | undefined): PickerOption[] =>
  (nodes ?? []).map((n) => ({ id: n.id, label: n.name }));

const STATUS_TONE: Record<JoinRequestStatus, 'warn' | 'ok' | 'err' | 'gray'> = {
  PENDING: 'warn',
  APPROVED: 'ok',
  REJECTED: 'err',
  CANCELLED: 'gray',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--ivory-card, #fff)',
  border: '1px solid var(--line-soft, rgba(42,38,32,0.08))',
  borderRadius: 'var(--radius-lg, 14px)',
  padding: 'clamp(18px, 4vw, 26px)',
  boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
  marginBottom: 18,
};

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const { ready, isAuthenticated, me, refreshMe, logout } = useAuth();

  useEffect(() => {
    if (ready && !isAuthenticated) navigate('/login', { replace: true });
  }, [ready, isAuthenticated, navigate]);

  const mineQ = useQuery({
    queryKey: ['join-requests', 'mine'],
    queryFn: listMyJoinRequests,
    enabled: ready && isAuthenticated,
  });

  const invalidateMine = () => queryClient.invalidateQueries({ queryKey: ['join-requests', 'mine'] });

  const sorted = useMemo(
    () => [...(mineQ.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [mineQ.data],
  );
  const pending = sorted.find((r) => r.status === 'PENDING') ?? null;
  const latest = sorted[0] ?? null;

  const cancelM = useMutation({
    mutationFn: cancelJoinRequest,
    onSuccess: () => {
      invalidateMine();
      push({ kind: 'ok', title: t('join.cancelled') });
    },
    onError: (err) => push({ kind: 'error', title: t('common.failure'), msg: errMsg(err, t('common.error')) }),
  });

  const [reloading, setReloading] = useState(false);
  const reloadSession = async () => {
    setReloading(true);
    try {
      const fresh = await refreshMe();
      if (hasMinistryAccess(fresh)) navigate('/dashboard', { replace: true });
      else if (hasMemberSpace(fresh)) navigate('/my-goals', { replace: true });
      else push({ kind: 'error', title: t('join.notActiveYet') });
    } catch {
      push({ kind: 'error', title: t('common.failure'), msg: t('common.retryLater') });
    } finally {
      setReloading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--ink-500)', fontFamily: 'var(--font-sans)' }}>
        {t('common.loading')}
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment)', fontFamily: 'var(--font-sans)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--parchment)', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '14px clamp(14px, 3vw, 24px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--green-600)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: 'var(--font-serif)' }}>S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: 'var(--green-800)' }}>shephr</span>
          </div>
          <Button variant="ghost" iconL={<Icon name="logout" size={14} />} onClick={handleLogout}>
            {t('sidebar.logout')}
          </Button>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(26px, 6vw, 48px) 20px 60px' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(24px, 6vw, 34px)', color: 'var(--green-900)', margin: '0 0 6px' }}>
          {t('join.title')}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-600)', margin: '0 0 26px' }}>
          {me?.fullName ? t('join.greeting', { name: me.fullName }) : t('join.subtitle')}
        </p>

        {mineQ.isLoading ? (
          <p style={{ color: 'var(--ink-400)' }}>{t('common.loading')}</p>
        ) : pending ? (
          <WaitingCard
            request={pending}
            cancelling={cancelM.isPending}
            onCancel={() => cancelM.mutate(pending.id)}
          />
        ) : latest?.status === 'APPROVED' ? (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Badge tone="ok" dot>{t('join.status.APPROVED')}</Badge>
              <strong>{latest.assemblyName ?? latest.newAssemblyName ?? '—'}</strong>
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 8px' }}>
              {t('join.approvedTitle')}
            </h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-600)', margin: '0 0 16px' }}>
              {t('join.approvedMsg')}
            </p>
            <Button variant="primary" disabled={reloading} onClick={reloadSession}>
              {reloading ? t('common.loading') : t('join.reload')}
            </Button>
          </div>
        ) : (
          <>
            {latest?.status === 'REJECTED' && (
              <div style={{ ...cardStyle, borderColor: 'var(--err, #B86A4A)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Badge tone="err">{t('join.status.REJECTED')}</Badge>
                  <strong>{latest.assemblyName ?? latest.newAssemblyName ?? '—'}</strong>
                </div>
                {latest.decisionReason && (
                  <p style={{ margin: '0 0 6px', fontSize: 13.5, color: 'var(--ink-600)' }}>{latest.decisionReason}</p>
                )}
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-500)' }}>{t('join.rejectedRetry')}</p>
              </div>
            )}
            <SearchFlow
              onSubmitted={() => invalidateMine()}
              onAlreadyPending={() => invalidateMine()}
              onAlreadyAttached={() => void refreshMe()}
            />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  État d'attente : ma demande, statut, annulation.
// ---------------------------------------------------------------------------------------------

function WaitingCard({
  request, cancelling, onCancel,
}: {
  request: JoinRequestResponse;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const name = request.assemblyName ?? request.newAssemblyName ?? '—';
  return (
    <div style={cardStyle}>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 12px' }}>
        {t('join.waitingTitle')}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <Badge tone={STATUS_TONE[request.status]} dot>{t(`join.status.${request.status}`)}</Badge>
        <strong>{name}</strong>
        {request.cityName && <span style={{ color: 'var(--ink-500)', fontSize: 13.5 }}>· {request.cityName}</span>}
        <Badge tone="earth">{t(`join.role.${request.requestedRole}`)}</Badge>
        {request.structureRequestId != null && (
          <Badge tone="gray">{t('join.newAssemblyBadge')}</Badge>
        )}
      </div>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-600)', margin: '0 0 16px' }}>
        {t('join.waitingMsg')}
      </p>
      <Button variant="ghost" iconL={<Icon name="x" size={14} />} disabled={cancelling} onClick={onCancel}>
        {t('join.cancel')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  Recherche d'assemblée (debounce min 2 car.) + drill nation→région→ville + création.
// ---------------------------------------------------------------------------------------------

function SearchFlow({
  onSubmitted, onAlreadyPending, onAlreadyAttached,
}: {
  onSubmitted: () => void;
  onAlreadyPending: () => void;
  onAlreadyAttached: () => void;
}) {
  const { t } = useTranslation();
  const { push } = useToast();

  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);

  // Drill nation → région → ville (contexte existant des demandes de structure).
  const contextQ = useQuery({ queryKey: ['structure-requests', 'context'], queryFn: fetchRequestContext });
  const [nationId, setNationId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [cityId, setCityId] = useState('');
  const allRegions = contextQ.data?.regions ?? [];
  const allCities = contextQ.data?.cities ?? [];
  const regions = allRegions.filter((r) => !nationId || r.parentId === nationId);
  const cities = allCities.filter((c) => !regionId || c.parentId === regionId);

  // Villes proposées à la CRÉATION d'une assemblée : on ne repart pas du référentiel entier,
  // on reste dans le périmètre déjà choisi au-dessus (région, sinon nation, sinon tout).
  const regionNameById = useMemo(() => new Map(allRegions.map((r) => [r.id, r.name])), [allRegions]);
  const scopedCities = regionId
    ? cities
    : nationId
      ? allCities.filter((c) => c.parentId != null && regions.some((r) => r.id === c.parentId))
      : allCities;

  const canSearch = debouncedQ.length >= 2 || cityId !== '';
  const searchQ = useQuery({
    queryKey: ['join-requests', 'assemblies', debouncedQ, cityId],
    queryFn: () => searchAssemblies({ q: debouncedQ.length >= 2 ? debouncedQ : undefined, cityId: cityId || undefined }),
    enabled: canSearch,
  });

  // (2) Choix du rôle sur une assemblée sélectionnée / (3) création d'assemblée.
  const [picked, setPicked] = useState<AssemblyOption | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCityId, setNewCityId] = useState('');
  const [newName, setNewName] = useState('');

  // La ville choisie dans le parcours du haut est celle où l'on crée : on la reprend d'office.
  useEffect(() => {
    if (cityId) setNewCityId(cityId);
  }, [cityId]);

  // Le périmètre a changé (autre nation/région) : une ville hors périmètre ne peut pas rester choisie.
  useEffect(() => {
    if (newCityId && !scopedCities.some((c) => c.id === newCityId)) setNewCityId('');
  }, [scopedCities, newCityId]);

  const createM = useMutation({
    mutationFn: createJoinRequest,
    onSuccess: () => {
      setPicked(null);
      setCreateOpen(false);
      push({ kind: 'ok', title: t('join.created') });
      onSubmitted();
    },
    onError: (err) => {
      const code = errCode(err);
      if (code === 'JOIN_REQUEST_ALREADY_PENDING') {
        // Une demande est déjà en attente : on bascule sur l'écran d'attente.
        push({ kind: 'ok', title: t('join.alreadyPending') });
        onAlreadyPending();
        return;
      }
      if (code === 'ALREADY_ATTACHED') {
        push({ kind: 'error', title: t('join.alreadyAttached'), msg: errMsg(err, '') || undefined });
        onAlreadyAttached();
        return;
      }
      push({ kind: 'error', title: t('join.createRefused'), msg: errMsg(err, t('common.error')) });
    },
  });

  const submitExisting = (role: JoinRequestRole) => {
    if (!picked) return;
    createM.mutate({ assemblyNodeId: picked.id, requestedRole: role });
  };

  const submitNew = (role: JoinRequestRole) => {
    if (!newCityId || newName.trim().length === 0) return;
    createM.mutate({ requestedRole: role, newAssembly: { cityId: newCityId, name: newName.trim() } });
  };

  const results = searchQ.data ?? [];

  return (
    <>
      {/* (1) Recherche */}
      <div style={cardStyle}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 12px' }}>
          {t('join.searchTitle')}
        </h2>
        <Field label={t('join.searchLabel')} hint={debouncedQ.length > 0 && debouncedQ.length < 2 && !cityId ? t('join.searchTooShort') : undefined}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('join.searchPlaceholder')}
            icon={<Icon name="search" size={14} />}
          />
        </Field>

        <div style={{ margin: '12px 0 0' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 8 }}>{t('join.browseTitle')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 10 }}>
            <Picker
              value={nationId}
              onChange={(id) => { setNationId(id); setRegionId(''); setCityId(''); }}
              options={toOptions(contextQ.data?.nations)}
              placeholder={t('join.nationPlaceholder')}
            />
            <Picker
              value={regionId}
              onChange={(id) => { setRegionId(id); setCityId(''); }}
              options={toOptions(regions)}
              placeholder={t('join.regionPlaceholder')}
              disabled={!nationId}
            />
            <Picker
              value={cityId}
              onChange={setCityId}
              options={toOptions(cities)}
              placeholder={t('join.cityPlaceholder')}
              disabled={!regionId}
            />
          </div>
        </div>

        {canSearch && (
          <div style={{ marginTop: 14 }}>
            {searchQ.isLoading ? (
              <p style={{ color: 'var(--ink-400)', margin: 0 }}>{t('common.loading')}</p>
            ) : results.length === 0 ? (
              <p style={{ color: 'var(--ink-400)', margin: 0, fontStyle: 'italic' }}>{t('join.noResult')}</p>
            ) : (
              <div style={{ border: '1px solid var(--line-soft, rgba(42,38,32,0.08))', borderRadius: 10, overflow: 'hidden' }}>
                {results.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setPicked(a)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid var(--line-soft, rgba(42,38,32,0.06))', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink-900, #1E1B16)' }}>{a.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                        {[a.cityName, a.regionName, a.nationName].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {a.hasLeader && <Badge tone="earth">{t('join.hasLeaderBadge')}</Badge>}
                    <Icon name="chevRight" size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* (3) « Mon assemblée n'existe pas » */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--green-700, #1E3A2F)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
              textDecoration: 'underline',
            }}
          >
            {t('join.notFound')}
          </button>
        </div>
      </div>

      {createOpen && (
        <div style={cardStyle}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 6px' }}>
            {t('join.newAssemblyTitle')}
          </h2>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--ink-500)' }}>{t('join.newAssemblySub')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label={t('join.cityLabel')}>
              <Picker
                value={newCityId}
                onChange={setNewCityId}
                options={scopedCities.map((c) => ({
                  id: c.id,
                  label: c.name,
                  // Hors périmètre d'une région précise, on rappelle la région de chaque ville.
                  sub: regionId ? undefined : regionNameById.get(c.parentId ?? ''),
                }))}
                placeholder={t('common.choose')}
                searchPlaceholder={t('join.cityLabel')}
              />
            </Field>
            <Field label={t('join.newAssemblyName')}>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('join.newAssemblyNamePlaceholder')}
              />
            </Field>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Button
                variant="primary"
                disabled={!newCityId || newName.trim().length === 0 || createM.isPending}
                onClick={() => submitNew('LEADER')}
              >
                {createM.isPending ? t('join.submitting') : t('join.roleLeader')}
              </Button>
              <Button
                disabled={!newCityId || newName.trim().length === 0 || createM.isPending}
                onClick={() => submitNew('MEMBER')}
              >
                {t('join.roleMember')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* (2) Choix du rôle pour l'assemblée sélectionnée */}
      {picked && (
        <div className="modal-backdrop" onClick={() => setPicked(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="ttl">{t('join.roleQuestion', { name: picked.name })}</div>
              <div className="sub">
                {[picked.cityName, picked.regionName, picked.nationName].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Button
                  variant="primary"
                  disabled={createM.isPending}
                  onClick={() => submitExisting('LEADER')}
                  style={{ justifyContent: 'center' }}
                >
                  {t('join.roleLeader')}
                </Button>
                {picked.hasLeader && (
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--earth-700, #8E6B47)', lineHeight: 1.5 }}>
                    <Icon name="warning" size={12} /> {t('join.coLeaderWarning')}
                  </p>
                )}
                <Button
                  disabled={createM.isPending}
                  onClick={() => submitExisting('MEMBER')}
                  style={{ justifyContent: 'center' }}
                >
                  {t('join.roleMember')}
                </Button>
              </div>
            </div>
            <div className="modal-foot">
              <Button variant="ghost" onClick={() => setPicked(null)}>{t('common.cancel')}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
