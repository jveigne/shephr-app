import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Badge, Button, Field, Input, Modal, Select, Table, TopBar, type Column } from '../components/ui';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import {
  approveStructureRequest, cancelStructureRequest, canValidateRequests, createStructureRequest,
  fetchRequestContext, listMyRequests, listPendingRequests, rejectStructureRequest,
  type CreateRequestChain, type RequestNodeOption, type StructureRequestContext,
  type StructureRequestResponse, type StructureRequestStatus, type StructureRequestType,
} from '../services/structureRequestsApi';

// Lot D3 v2 (RDG 22/07) : dépôt « chercher ou créer » — TOUT utilisateur peut demander une
// région, ville ou assemblée (RG-DS-01 v2) ; un parent introuvable dans la recherche devient un
// maillon de la chaîne (RG-DS-08). Le SECRETARIAT valide ici (file « À valider »).

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

  const [depositOpen, setDepositOpen] = useState(false);
  const [rejecting, setRejecting] = useState<StructureRequestResponse | null>(null);
  const [reason, setReason] = useState('');

  const contextQ = useQuery({ queryKey: ['structure-requests', 'context'], queryFn: fetchRequestContext });
  const mineQ = useQuery({ queryKey: ['structure-requests', 'mine'], queryFn: listMyRequests });
  const pendingQ = useQuery({
    queryKey: ['structure-requests', 'pending'],
    queryFn: listPendingRequests,
    enabled: isValidator,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['structure-requests'] });
  const canPropose = (contextQ.data?.nations.length ?? 0) > 0;

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

  const typeLabel = (type: StructureRequestType) => t(`requests.types.${type}`);

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
          canPropose ? (
            <Button variant="primary" iconL={<Icon name="plus" size={15} />} onClick={() => setDepositOpen(true)}>
              {t('requests.newRequest')}
            </Button>
          ) : undefined
        }
      />

      <div className="content">
        <p className="section-sub">{t('requests.intro')}</p>

        {isValidator && (
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
      </div>

      <DepositModal
        open={depositOpen}
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
    </>
  );
}

// ---------------------------------------------------------------------------------------------
//  Dépôt « chercher ou créer » (RG-DS-08) — un parent introuvable devient un maillon à créer.
// ---------------------------------------------------------------------------------------------

/** Sélection d'un niveau : entité existante OU nom à créer. */
type LevelPick = { kind: 'existing'; option: RequestNodeOption } | { kind: 'create'; name: string } | null;

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
  const [type, setType] = useState<StructureRequestType | ''>('');
  const [cityPick, setCityPick] = useState<LevelPick>(null);
  const [regionPick, setRegionPick] = useState<LevelPick>(null);
  const [nationId, setNationId] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      setType('');
      setCityPick(null);
      setRegionPick(null);
      setNationId(context.nations.length === 1 ? context.nations[0].id : '');
      setName('');
    }
  }, [open, context]);

  // Chaîne : quels niveaux sont requis, et lesquels sont « à créer » ?
  const needCity = type === 'ASSEMBLY';
  const needRegion = type === 'CITY' || (needCity && cityPick?.kind === 'create');
  const needNation = type === 'REGION' || (needRegion && regionPick?.kind === 'create');

  // Filtrage en cascade : une région choisie restreint les villes ; une nation restreint les régions.
  const regionsForNation = useMemo(
    () => (nationId ? context.regions.filter((r) => r.parentId === nationId) : context.regions),
    [context.regions, nationId],
  );
  const citiesForRegion = useMemo(
    () => (regionPick?.kind === 'existing'
      ? context.cities.filter((c) => c.parentId === regionPick.option.id)
      : context.cities),
    [context.cities, regionPick],
  );

  const payload: CreateRequestChain | null = useMemo(() => {
    if (type === '' || name.trim().length === 0) return null;
    const links: CreateRequestChain['links'] = [];
    let rootParentId: string | null = null;

    if (type === 'REGION') {
      if (!nationId) return null;
      rootParentId = nationId;
      links.push({ type: 'REGION', name: name.trim() });
    } else if (type === 'CITY') {
      if (regionPick?.kind === 'existing') {
        rootParentId = regionPick.option.id;
      } else if (regionPick?.kind === 'create') {
        if (!nationId) return null;
        rootParentId = nationId;
        links.push({ type: 'REGION', name: regionPick.name });
      } else return null;
      links.push({ type: 'CITY', name: name.trim() });
    } else {
      if (cityPick?.kind === 'existing') {
        rootParentId = cityPick.option.id;
      } else if (cityPick?.kind === 'create') {
        if (regionPick?.kind === 'existing') {
          rootParentId = regionPick.option.id;
        } else if (regionPick?.kind === 'create') {
          if (!nationId) return null;
          rootParentId = nationId;
          links.push({ type: 'REGION', name: regionPick.name });
        } else return null;
        links.push({ type: 'CITY', name: cityPick.name });
      } else return null;
      links.push({ type: 'ASSEMBLY', name: name.trim() });
    }
    return rootParentId ? { rootParentId, links } : null;
  }, [type, name, cityPick, regionPick, nationId]);

  // Existant à afficher (RG-DS-06) : celui du parent DIRECT choisi quand il existe déjà.
  const existingHint = useMemo(() => {
    const direct = type === 'ASSEMBLY' ? cityPick : type === 'CITY' ? regionPick : null;
    if (type === 'REGION') {
      const nation = context.nations.find((n) => n.id === nationId);
      return nation ? { parent: nation.name, list: nation.existing } : null;
    }
    if (direct?.kind === 'existing') {
      return { parent: direct.option.name, list: direct.option.existing };
    }
    return null;
  }, [type, cityPick, regionPick, nationId, context.nations]);

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
        <Field label={t('requests.typeLabel')}>
          <Select value={type} onChange={(e) => {
            setType(e.target.value as StructureRequestType | '');
            setCityPick(null);
            setRegionPick(null);
          }}>
            <option value="">{t('common.choose')}</option>
            {(['REGION', 'CITY', 'ASSEMBLY'] as StructureRequestType[]).map((tp) => (
              <option key={tp} value={tp}>{t(`requests.types.${tp}`)}</option>
            ))}
          </Select>
        </Field>

        {needCity && (
          <SearchOrCreate
            label={t('requests.parentLabel.ASSEMBLY')}
            options={citiesForRegion}
            pick={cityPick}
            onChange={(p) => { setCityPick(p); if (p?.kind !== 'create') setRegionPick(null); }}
          />
        )}

        {needRegion && (
          <SearchOrCreate
            label={t('requests.parentLabel.CITY')}
            options={regionsForNation}
            pick={regionPick}
            onChange={setRegionPick}
          />
        )}

        {needNation && (
          <Field label={t('requests.parentLabel.REGION')}>
            <Select value={nationId} onChange={(e) => setNationId(e.target.value)}>
              <option value="">{t('common.choose')}</option>
              {context.nations.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </Select>
          </Field>
        )}

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

        {payload && payload.links.length > 1 && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-600)', lineHeight: 1.6 }}>
            {t('requests.chainNote', { count: payload.links.length })}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Recherche dans la liste du niveau ; si introuvable → « Créer "…" » devient un maillon (RG-DS-08). */
function SearchOrCreate({
  label, options, pick, onChange,
}: {
  label: string;
  options: RequestNodeOption[];
  pick: LevelPick;
  onChange: (p: LevelPick) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => { if (pick === null) setQuery(''); }, [pick]);

  if (pick) {
    return (
      <Field label={label}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tone={pick.kind === 'existing' ? 'earth' : 'warn'}>
            {pick.kind === 'existing' ? pick.option.name : t('requests.toCreate', { name: pick.name })}
          </Badge>
          <Button variant="ghost" iconL={<Icon name="x" size={13} />} onClick={() => onChange(null)}>
            {t('requests.changePick')}
          </Button>
        </div>
      </Field>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  const exact = options.some((o) => o.name.toLowerCase() === q);

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
            onClick={() => onChange({ kind: 'existing', option: o })}
            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line,#f2f2f2)' }}
          >
            {o.name}
          </div>
        ))}
        {q.length > 0 && !exact && (
          <div
            onClick={() => onChange({ kind: 'create', name: query.trim() })}
            style={{ padding: '8px 12px', cursor: 'pointer', color: 'var(--ink-600)', fontWeight: 600 }}
          >
            <Icon name="plus" size={13} /> {t('requests.createOption', { name: query.trim() })}
          </div>
        )}
        {matches.length === 0 && q.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--ink-500)' }}>{t('requests.noOption')}</div>
        )}
      </div>
    </Field>
  );
}
