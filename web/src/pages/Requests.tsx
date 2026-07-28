import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Badge, Button, Field, Input, Modal, Table, TopBar, type Column } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { isAssemblyLeaderOnly } from '../services/authApi';
import {
  approveStructureRequest, cancelStructureRequest, canValidateRequests, createStructureRequest,
  fetchRequestContext, listMyRequests, listPendingRequests, rejectStructureRequest,
  type CreateRequestChain, type RequestNodeOption, type StructureRequestContext,
  type StructureRequestResponse, type StructureRequestStatus, type StructureRequestType,
} from '../services/structureRequestsApi';
import {
  approveJoinRequest, cancelJoinRequest, listMyJoinRequests, listPendingJoinRequests,
  mayReviewJoinRequests, rejectJoinRequest, reviewableJoinRequests, type JoinRequestResponse,
} from '../services/joinRequestsApi';

// RDG 25/07 : nation, région et ville se créent DIRECTEMENT (SECRETARIAT / back-office) — une
// demande ne porte plus que sur une ASSEMBLÉE rattachée à une ville EXISTANTE. Le SECRETARIAT
// valide ici (file « À valider ») ; les chaînes déposées avant le 25/07 restent décidables.

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const STATUS_TONE: Record<StructureRequestStatus, 'warn' | 'ok' | 'err' | 'gray'> = {
  PENDING: 'warn',
  APPROVED: 'ok',
  REJECTED: 'err',
  CANCELLED: 'gray',
};

export function RequestsPage() {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const dateLocale = (i18n.resolvedLanguage || i18n.language) === 'en' ? 'en-GB' : 'fr-FR';
  const isValidator = canValidateRequests(me);
  // Un dirigeant d'assemblée ne voit QUE les rattachements à son assemblée : tout le bloc
  // « demandes de structure » (dépôt, suivi, validation) lui est masqué.
  const showStructure = !isAssemblyLeaderOnly(me);

  const [depositOpen, setDepositOpen] = useState(false);
  const [rejecting, setRejecting] = useState<StructureRequestResponse | null>(null);
  const [reason, setReason] = useState('');
  // Feature B — rejet d'une demande de RATTACHEMENT (motif obligatoire).
  const [rejectingJoin, setRejectingJoin] = useState<JoinRequestResponse | null>(null);
  const [joinReason, setJoinReason] = useState('');

  const contextQ = useQuery({
    queryKey: ['structure-requests', 'context'],
    queryFn: fetchRequestContext,
    enabled: showStructure,
  });
  const mineQ = useQuery({
    queryKey: ['structure-requests', 'mine'],
    queryFn: listMyRequests,
    enabled: showStructure,
  });
  const pendingQ = useQuery({
    queryKey: ['structure-requests', 'pending'],
    queryFn: listPendingRequests,
    enabled: isValidator && showStructure,
  });

  // Feature B — rattachements : file pending (403 sauf dirigeant d'assemblée / secrétariat /
  // superAdmin — géré proprement : la file est masquée) + mes demandes.
  const mayReviewJoin = mayReviewJoinRequests(me);
  const joinPendingQ = useQuery({
    queryKey: ['join-requests', 'pending'],
    queryFn: listPendingJoinRequests,
    enabled: mayReviewJoin,
    retry: false,
  });
  const joinPendingForbidden =
    (joinPendingQ.error as { response?: { status?: number } } | null)?.response?.status === 403;
  const showJoinPending = mayReviewJoin && !joinPendingForbidden && !joinPendingQ.isError;
  const joinMineQ = useQuery({ queryKey: ['join-requests', 'mine'], queryFn: listMyJoinRequests });
  // Un dirigeant d'assemblée ne décide que des rattachements à SON assemblée : les demandes
  // portant création d'une assemblée (même dans sa ville) restent au secrétariat.
  const joinPendingRows = useMemo(
    () => reviewableJoinRequests(me, joinPendingQ.data ?? []),
    [me, joinPendingQ.data],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['structure-requests'] });
  const invalidateJoin = () => queryClient.invalidateQueries({ queryKey: ['join-requests'] });
  // RDG 25/07 : on ne peut demander qu'une assemblée — il faut une ville existante où la rattacher.
  const canPropose = (contextQ.data?.cities.length ?? 0) > 0;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const createM = useMutation({
    mutationFn: createStructureRequest,
    onSuccess: (r) => {
      invalidate();
      setDepositOpen(false);
      push({ kind: 'ok', title: t('requests.createdToast', { name: r.name }) });
    },
    onError: (err) => push({ kind: 'error', title: t('requests.createRefused'), msg: errMsg(err, t('common.error')) }),
  });

  const cancelM = useMutation({
    mutationFn: cancelStructureRequest,
    onSuccess: () => { invalidate(); push({ kind: 'ok', title: t('requests.cancelledToast') }); },
    onError: (err) => push({ kind: 'error', title: t('common.failure'), msg: errMsg(err, t('common.error')) }),
  });

  const approveM = useMutation({
    mutationFn: approveStructureRequest,
    onSuccess: (r) => { invalidate(); push({ kind: 'ok', title: t('requests.approvedToast', { name: r.name }) }); },
    onError: (err) => push({ kind: 'error', title: t('common.failure'), msg: errMsg(err, t('common.error')) }),
  });

  const rejectM = useMutation({
    mutationFn: ({ id, reason: r }: { id: string; reason: string }) => rejectStructureRequest(id, r),
    onSuccess: (r) => {
      invalidate();
      setRejecting(null);
      setReason('');
      push({ kind: 'ok', title: t('requests.rejectedToast', { name: r.name }) });
    },
    onError: (err) => push({ kind: 'error', title: t('common.failure'), msg: errMsg(err, t('common.error')) }),
  });

  // Feature B — mutations sur les demandes de rattachement.
  const joinApproveM = useMutation({
    mutationFn: approveJoinRequest,
    onSuccess: (r) => {
      invalidateJoin();
      push({ kind: 'ok', title: t('join.approvedToastAdmin', { name: r.userName }) });
    },
    onError: (err) => push({ kind: 'error', title: t('common.failure'), msg: errMsg(err, t('common.error')) }),
  });

  const joinRejectM = useMutation({
    mutationFn: ({ id, reason: r }: { id: string; reason: string }) => rejectJoinRequest(id, r),
    onSuccess: (r) => {
      invalidateJoin();
      setRejectingJoin(null);
      setJoinReason('');
      push({ kind: 'ok', title: t('join.rejectedToastAdmin', { name: r.userName }) });
    },
    onError: (err) => push({ kind: 'error', title: t('common.failure'), msg: errMsg(err, t('common.error')) }),
  });

  const joinCancelM = useMutation({
    mutationFn: cancelJoinRequest,
    onSuccess: () => { invalidateJoin(); push({ kind: 'ok', title: t('join.cancelled') }); },
    onError: (err) => push({ kind: 'error', title: t('common.failure'), msg: errMsg(err, t('common.error')) }),
  });

  const typeLabel = (type: StructureRequestType) => t(`requests.types.${type}`);

  // Assemblée visée d'une demande de rattachement (existante ou « à créer »).
  const joinAssemblyCell = (r: JoinRequestResponse) => (
    <div>
      <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>
        {r.assemblyName ?? r.newAssemblyName ?? '—'}
      </span>
      {r.cityName && <span style={{ color: 'var(--ink-500)' }}> · {r.cityName}</span>}
      {r.structureRequestId != null && (
        <span style={{ marginLeft: 6 }}>
          <Badge tone="gray">{t('join.newAssemblyBadge')}</Badge>
        </span>
      )}
    </div>
  );

  // Rôle demandé + avertissement co-dirigeant (assemblée déjà pourvue d'un titulaire).
  const joinRoleCell = (r: JoinRequestResponse) => (
    <div>
      <Badge tone={r.requestedRole === 'LEADER' ? 'earth' : 'gray'}>
        {t(`join.role.${r.requestedRole}`)}
      </Badge>
      {r.assemblyHasLeader && r.requestedRole === 'LEADER' && (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--earth-700, #8E6B47)', maxWidth: 260, lineHeight: 1.45 }}>
          <Icon name="warning" size={11} /> {t('join.coLeaderWarning')}
        </div>
      )}
    </div>
  );

  const joinPendingCols: Column<JoinRequestResponse>[] = [
    { label: t('requests.colDate'), render: (r) => <span style={{ color: 'var(--ink-500)' }}>{fmtDate(r.createdAt)}</span> },
    { label: t('join.colUser'), render: (r) => <span style={{ fontWeight: 500 }}>{r.userName}</span> },
    { label: t('join.colAssembly'), render: joinAssemblyCell },
    { label: t('join.colRole'), render: joinRoleCell },
    {
      label: '',
      render: (r) => (
        <div className="row-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="primary" iconL={<Icon name="check" size={14} />} disabled={joinApproveM.isPending}
            onClick={() => joinApproveM.mutate(r.id)}>
            {t('requests.approve')}
          </Button>
          <Button variant="ghost" iconL={<Icon name="x" size={14} />} disabled={joinRejectM.isPending}
            onClick={() => { setRejectingJoin(r); setJoinReason(''); }}>
            {t('requests.reject')}
          </Button>
        </div>
      ),
    },
  ];

  const joinMineCols: Column<JoinRequestResponse>[] = [
    { label: t('requests.colDate'), render: (r) => <span style={{ color: 'var(--ink-500)' }}>{fmtDate(r.createdAt)}</span> },
    { label: t('join.colAssembly'), render: joinAssemblyCell },
    { label: t('join.colRole'), render: joinRoleCell },
    {
      label: t('requests.colStatus'),
      render: (r) => (
        <div>
          <Badge tone={STATUS_TONE[r.status]}>{t(`join.status.${r.status}`)}</Badge>
          {r.status === 'REJECTED' && r.decisionReason && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-500)' }}>{r.decisionReason}</div>
          )}
          {r.decidedByName && r.status !== 'PENDING' && r.status !== 'CANCELLED' && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-500)' }}>
              {t('join.decidedBy', { name: r.decidedByName })}
            </div>
          )}
        </div>
      ),
    },
    {
      label: '',
      render: (r) =>
        r.status === 'PENDING' ? (
          <Button variant="ghost" disabled={joinCancelM.isPending} onClick={() => joinCancelM.mutate(r.id)}>
            {t('requests.cancel')}
          </Button>
        ) : null,
    },
  ];

  const parentCell = (r: StructureRequestResponse) => (
    <span style={{ color: 'var(--ink-600)' }}>
      {r.parentName ?? '—'}
      {r.parentPending && (
        <span style={{ marginLeft: 6 }}>
          <Badge tone="warn">{t('requests.parentPendingBadge')}</Badge>
        </span>
      )}
    </span>
  );

  const baseCols: Column<StructureRequestResponse>[] = [
    { label: t('requests.colDate'), render: (r) => <span style={{ color: 'var(--ink-500)' }}>{fmtDate(r.createdAt)}</span> },
    { label: t('requests.colType'), render: (r) => <Badge tone="earth">{typeLabel(r.type)}</Badge> },
    { label: t('requests.colName'), render: (r) => <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>{r.name}</span> },
    { label: t('requests.colParent'), render: parentCell },
  ];

  const pendingCols: Column<StructureRequestResponse>[] = [
    ...baseCols,
    { label: t('requests.colRequester'), render: (r) => <span>{r.requestedByName ?? '—'}</span> },
    {
      label: '',
      render: (r) => (
        <div className="row-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="primary" iconL={<Icon name="check" size={14} />} disabled={approveM.isPending}
            title={r.parentPending ? t('requests.approveChainHint') : undefined}
            onClick={() => approveM.mutate(r.id)}>
            {t('requests.approve')}
          </Button>
          <Button variant="ghost" iconL={<Icon name="x" size={14} />} disabled={rejectM.isPending}
            onClick={() => { setRejecting(r); setReason(''); }}>
            {t('requests.reject')}
          </Button>
        </div>
      ),
    },
  ];

  const mineCols: Column<StructureRequestResponse>[] = [
    ...baseCols,
    {
      label: t('requests.colStatus'),
      render: (r) => (
        <div>
          <Badge tone={STATUS_TONE[r.status]}>{t(`requests.status.${r.status}`)}</Badge>
          {r.status === 'REJECTED' && r.decisionReason && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-500)' }}>{r.decisionReason}</div>
          )}
          {r.status === 'APPROVED' && r.createdEntityId && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-500)' }}>{t('requests.entityCreated')}</div>
          )}
        </div>
      ),
    },
    {
      label: '',
      render: (r) =>
        r.status === 'PENDING' ? (
          <Button variant="ghost" disabled={cancelM.isPending} onClick={() => cancelM.mutate(r.id)}>
            {t('requests.cancel')}
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <TopBar
        title={t('requests.title')}
        crumbs={[t('common.brand'), t('requests.title')]}
        actions={
          canPropose && showStructure ? (
            <Button variant="primary" iconL={<Icon name="plus" size={15} />} onClick={() => setDepositOpen(true)}>
              {t('requests.newRequest')}
            </Button>
          ) : undefined
        }
      />

      <div className="content">
        {showStructure && <p className="section-sub">{t('requests.intro')}</p>}

        {isValidator && showStructure && (
          <>
            <h3 style={{ margin: '18px 0 10px' }}>{t('requests.toValidate')}</h3>
            <div className="card" style={{ padding: 0, marginBottom: 24 }}>
              <Table<StructureRequestResponse>
                columns={pendingCols}
                rows={(pendingQ.data ?? []).map((r) => ({ ...r }))}
                zebra
                empty={
                  <div className="empty">
                    <div className="icon-wrap"><Icon name="inbox" size={26} /></div>
                    <h4>{t('requests.noPending')}</h4>
                  </div>
                }
              />
            </div>
          </>
        )}

        {showStructure && (
          <>
            <h3 style={{ margin: '18px 0 10px' }}>{t('requests.mine')}</h3>
            <div className="card" style={{ padding: 0 }}>
              <Table<StructureRequestResponse>
                columns={mineCols}
                rows={(mineQ.data ?? []).map((r) => ({ ...r }))}
                zebra
                empty={
                  <div className="empty">
                    <div className="icon-wrap"><Icon name="inbox" size={26} /></div>
                    <h4>{t('requests.noMine')}</h4>
                    <p>{canPropose ? t('requests.noMineHint') : t('requests.notEligible')}</p>
                  </div>
                }
              />
            </div>
          </>
        )}

        {/* Feature B — Rattachements : demandes de rattachement à une assemblée. */}
        {(showJoinPending || (joinMineQ.data?.length ?? 0) > 0) && (
          <>
            <h2 style={{ margin: '28px 0 4px', fontSize: 18 }}>{t('join.sectionTitle')}</h2>
            <p className="section-sub" style={{ margin: '0 0 10px' }}>{t('join.sectionIntro')}</p>

            {showJoinPending && (
              <>
                <h3 style={{ margin: '14px 0 10px' }}>{t('join.pendingTitle')}</h3>
                <div className="card" style={{ padding: 0, marginBottom: 24 }}>
                  <Table<JoinRequestResponse>
                    columns={joinPendingCols}
                    rows={joinPendingRows.map((r) => ({ ...r }))}
                    zebra
                    empty={
                      <div className="empty">
                        <div className="icon-wrap"><Icon name="inbox" size={26} /></div>
                        <h4>{t('join.noPending')}</h4>
                      </div>
                    }
                  />
                </div>
              </>
            )}

            {(joinMineQ.data?.length ?? 0) > 0 && (
              <>
                <h3 style={{ margin: '14px 0 10px' }}>{t('join.mineTitle')}</h3>
                <div className="card" style={{ padding: 0 }}>
                  <Table<JoinRequestResponse>
                    columns={joinMineCols}
                    rows={(joinMineQ.data ?? []).map((r) => ({ ...r }))}
                    zebra
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      <DepositModal
        open={depositOpen && showStructure}
        onClose={() => setDepositOpen(false)}
        context={contextQ.data ?? { nations: [], regions: [], cities: [] }}
        submitting={createM.isPending}
        onSubmit={(payload) => createM.mutate(payload)}
      />

      <Modal
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        title={rejecting ? t('requests.rejectTitle', { name: rejecting.name }) : ''}
        sub={rejecting?.parentPending ? t('requests.rejectChainHint') : t('requests.rejectSub')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={reason.trim().length === 0 || rejectM.isPending}
              onClick={() => rejecting && rejectM.mutate({ id: rejecting.id, reason: reason.trim() })}
            >
              {t('requests.rejectConfirm')}
            </Button>
          </>
        }
      >
        <Field label={t('requests.rejectReasonLabel')}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={t('requests.rejectReasonPlaceholder')} />
        </Field>
      </Modal>

      {/* Feature B — refus d'une demande de rattachement (motif OBLIGATOIRE). */}
      <Modal
        open={rejectingJoin != null}
        onClose={() => setRejectingJoin(null)}
        title={rejectingJoin ? t('join.rejectTitle', { name: rejectingJoin.userName }) : ''}
        sub={t('join.rejectSub')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectingJoin(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={joinReason.trim().length === 0 || joinRejectM.isPending}
              onClick={() => rejectingJoin && joinRejectM.mutate({ id: rejectingJoin.id, reason: joinReason.trim() })}
            >
              {t('requests.rejectConfirm')}
            </Button>
          </>
        }
      >
        <Field label={t('join.rejectReasonLabel')}>
          <Input value={joinReason} onChange={(e) => setJoinReason(e.target.value)}
            placeholder={t('join.rejectReasonPlaceholder')} />
        </Field>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Dépôt (RDG 25/07) — une assemblée, rattachée à une ville EXISTANTE (recherche sans création).
// ---------------------------------------------------------------------------------------------

function DepositModal({
  open, onClose, context, submitting, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  context: StructureRequestContext;
  submitting: boolean;
  onSubmit: (payload: CreateRequestChain) => void;
}) {
  const { t } = useTranslation();
  const [city, setCity] = useState<RequestNodeOption | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      setCity(null);
      setName('');
    }
  }, [open, context]);

  const payload: CreateRequestChain | null = useMemo(() => {
    if (!city || name.trim().length === 0) return null;
    return { rootParentId: city.id, links: [{ type: 'ASSEMBLY', name: name.trim() }] };
  }, [city, name]);

  // Existant à afficher (RG-DS-06) : les assemblées de la ville choisie.
  const existingHint = city ? { parent: city.name, list: city.existing } : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('requests.newRequest')}
      sub={t('requests.newRequestSub')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!payload || submitting}
            onClick={() => payload && onSubmit(payload)}
          >
            {submitting ? t('requests.submitting') : t('requests.submit')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SearchExisting
          label={t('requests.parentLabel.ASSEMBLY')}
          options={context.cities}
          pick={city}
          onChange={setCity}
        />

        {existingHint && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.6 }}>
            {existingHint.list.length > 0
              ? t('requests.existingList', { parent: existingHint.parent, list: existingHint.list.join(', ') })
              : t('requests.existingNone', { parent: existingHint.parent })}
          </div>
        )}

        <Field label={t('requests.nameLabel')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('requests.namePlaceholder')} />
        </Field>

        <div style={{ fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.6 }}>
          {t('requests.cityMissingHint')}
        </div>
      </div>
    </Modal>
  );
}

/** Recherche dans les villes EXISTANTES — la création d'une ville est réservée au secrétariat. */
function SearchExisting({
  label, options, pick, onChange,
}: {
  label: string;
  options: RequestNodeOption[];
  pick: RequestNodeOption | null;
  onChange: (p: RequestNodeOption | null) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => { if (pick === null) setQuery(''); }, [pick]);

  if (pick) {
    return (
      <Field label={label}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tone="earth">{pick.name}</Badge>
          <Button variant="ghost" iconL={<Icon name="x" size={13} />} onClick={() => onChange(null)}>
            {t('requests.changePick')}
          </Button>
        </div>
      </Field>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;

  return (
    <Field label={label}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('requests.searchPlaceholder')}
        icon={<Icon name="search" size={14} />}
      />
      <div style={{
        marginTop: 6, maxHeight: 180, overflowY: 'auto',
        border: '1px solid var(--line,#eee)', borderRadius: 8,
      }}>
        {matches.slice(0, 30).map((o) => (
          <div
            key={o.id}
            onClick={() => onChange(o)}
            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line,#f2f2f2)' }}
          >
            {o.name}
          </div>
        ))}
        {matches.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--ink-500)' }}>{t('requests.noOption')}</div>
        )}
      </div>
    </Field>
  );
}
