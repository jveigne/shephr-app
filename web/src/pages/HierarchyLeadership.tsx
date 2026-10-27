import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { Badge, Button, Field, Input, Modal, TopBar } from '../components/ui';
import { useToast } from '../components/Toast';
import { SupervisorCard } from '../components/SupervisorCard';
import {
  acceptSupervisionRequest,
  cancelSupervisionRequest,
  createSupervisionRequest,
  fetchSupervisionOverview,
  refuseSupervisionRequest,
  revokeSupervisionRequest,
  searchDesigneeCandidates,
  type DiscipleshipPerson,
  type SupervisionOverview,
  type SupervisionRequestView,
} from '../services/leadersApi';
import { applySupervisionOverview, replacedSupervisorName, supervisionErrorMessage } from '../utils/supervision';

// ---------------------------------------------------------------------------------------------
//  Page 2 « Mon leadership » — D-HIE-01 (JP 28/10, lot HIE), GRATUITE, route `/hierarchy/leadership`.
//  Remplace l'écran « Superviseur » (la carte `SupervisorCard` quittait la page Hiérarchie).
//  Axe de la CHAÎNE de supervision (supervisor_id), jamais la géographie.
//  Sections :
//  - Mon superviseur : déclaration MONTANTE inchangée, immédiate (D-HIE-04, RG-HIE-21) ;
//  - Demandes reçues : Valider / Refuser ; valider REMPLACE le superviseur actuel → confirmation
//    explicite (D-HIE-03, RG-HIE-28) ;
//  - Les dirigeants que je suis : liens réels (`followed`, P-HIE-b), demandes en attente avec
//    Annuler (D-HIE-07), « Désigner un dirigeant » (D-HIE-02, recherche ≥ 2 caractères, 300 ms) ;
//  - Qui me suit : la désignation acceptée qui a posé mon superviseur (P-HIE-c), avec Retirer (D-HIE-04).
//  Compte non éligible (`!canDesignate`, P-HIE-a) : seule « Mon superviseur », en lecture — plus
//  « Qui me suit » s'il reste une désignation acceptée (rôle perdu après validation : se retirer
//  reste possible, écart B4 du backend, consigné W1 au §12 du plan).
//  Toutes les règles (éligibilité, cycle, doublon…) sont jugées par le serveur : les erreurs sont
//  traduites par leur code (`hierarchy.leadership.errors.*`), jamais recalculées ici.
// ---------------------------------------------------------------------------------------------

const SUPERVISION_KEY = ['leaders', 'supervision'] as const;

function personLine(p: DiscipleshipPerson): string {
  return [p.unitName, p.cityName].filter(Boolean).join(' · ');
}

function fmtDate(iso: string | null, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Pending =
  | { kind: 'accept'; request: SupervisionRequestView; replaced: string }
  | { kind: 'revoke'; request: SupervisionRequestView }
  | { kind: 'cancel'; request: SupervisionRequestView };

export function HierarchyLeadershipPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: SUPERVISION_KEY, queryFn: fetchSupervisionOverview });
  const overview = q.data;

  return (
    <>
      <TopBar
        title={t('hierarchy.leadership.title')}
        crumbs={[t('common.brand'), t('nav.hierarchy'), t('hierarchy.leadership.title')]}
      />
      <div className="content">
        <Link to="/hierarchy" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green-700)', fontWeight: 600, fontSize: 13.5, marginBottom: 14 }}>
          <Icon name="chevLeft" size={14} />
          {t('hierarchy.backToHome')}
        </Link>
        <p className="section-sub">{t('hierarchy.leadership.intro')}</p>

        {q.isLoading ? (
          <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
        ) : q.isError || !overview ? (
          <div className="card empty">
            <div className="icon-wrap"><Icon name="hierarchy" size={26} /></div>
            <h4>{t('hierarchy.leadership.loadError')}</h4>
          </div>
        ) : (
          <LeadershipSections overview={overview} />
        )}
      </div>
    </>
  );
}

/** RG-HIE-31 : compte non éligible — « Mon superviseur » en lecture seule. */
function ReadOnlySupervisor({ overview }: { overview: SupervisionOverview }) {
  const { t } = useTranslation();
  const sup = overview.supervisor;
  return (
    <Section title={t('hierarchy.leadership.mySupervisor')} icon="user">
      {sup ? <PersonRow person={sup} /> : <Empty>{t('supervisor.none')}</Empty>}
    </Section>
  );
}

function LeadershipSections({ overview }: { overview: SupervisionOverview }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [designOpen, setDesignOpen] = useState(false);

  const onError = (err: unknown) =>
    push({ kind: 'error', title: t('hierarchy.leadership.actionFailed'), msg: supervisionErrorMessage(err, t) });

  const actionM = useMutation({
    mutationFn: ({ kind, id }: { kind: 'accept' | 'refuse' | 'cancel' | 'revoke'; id: string }) => {
      switch (kind) {
        case 'accept': return acceptSupervisionRequest(id);
        case 'refuse': return refuseSupervisionRequest(id);
        case 'cancel': return cancelSupervisionRequest(id);
        default: return revokeSupervisionRequest(id);
      }
    },
    onSuccess: (data, { kind }) => {
      applySupervisionOverview(queryClient, data);
      setConfirm(null);
      push({ kind: 'ok', title: t(`hierarchy.leadership.done.${kind}`) });
    },
    onError: (err) => {
      setConfirm(null);
      onError(err);
      // L'état a pu changer ailleurs (demande déjà traitée, annulée…) : on relit.
      void queryClient.invalidateQueries({ queryKey: SUPERVISION_KEY });
    },
  });

  const accept = (request: SupervisionRequestView) => {
    const replaced = replacedSupervisorName(overview, request);
    if (replaced) setConfirm({ kind: 'accept', request, replaced });
    else actionM.mutate({ kind: 'accept', id: request.id });
  };

  const busy = actionM.isPending;
  const eligible = overview.canDesignate;

  return (
    <>
      {/* Mon superviseur — déclaration montante INCHANGÉE (D-HIE-04) ; lecture seule hors dirigeant. */}
      {eligible ? <SupervisorCard hideSupervisees /> : <ReadOnlySupervisor overview={overview} />}

      {eligible && (
      <>

      {/* Demandes reçues (D-HIE-02 / 03). */}
      <Section title={t('hierarchy.leadership.incomingTitle')} icon="inbox" count={overview.incoming.length}>
        {overview.incoming.length === 0 ? (
          <Empty>{t('hierarchy.leadership.incomingEmpty')}</Empty>
        ) : (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--ink-500)' }}>{t('hierarchy.leadership.incomingHint')}</p>
            {overview.incoming.map((r) => (
              <PersonRow
                key={r.id}
                person={r.requester}
                meta={t('hierarchy.leadership.sentOn', { date: fmtDate(r.createdAt, lang) })}
                actions={
                  <>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => actionM.mutate({ kind: 'refuse', id: r.id })}>
                      {t('hierarchy.leadership.refuse')}
                    </Button>
                    <Button size="sm" variant="primary" disabled={busy} onClick={() => accept(r)}>
                      {t('hierarchy.leadership.accept')}
                    </Button>
                  </>
                }
              />
            ))}
          </>
        )}
      </Section>

      {/* Les dirigeants que je suis (P-HIE-b) + demandes en attente (D-HIE-07). */}
      <Section
        title={t('hierarchy.leadership.followedTitle')}
        icon="users"
        count={overview.followed.length}
        action={
          <Button size="sm" iconL={<Icon name="plus" size={14} />} onClick={() => setDesignOpen(true)}>
            {t('hierarchy.leadership.designate')}
          </Button>
        }
      >
        {overview.followed.length === 0 && overview.outgoing.length === 0 ? (
          <Empty>{t('hierarchy.leadership.followedEmpty')}</Empty>
        ) : (
          <>
            {overview.followed.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
            {overview.outgoing.length > 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '10px 0 4px' }}>
                {t('hierarchy.leadership.outgoingTitle', { count: overview.outgoing.length })}
              </div>
            )}
            {overview.outgoing.map((r) => (
              <PersonRow
                key={r.id}
                person={r.designee}
                badge={<Badge tone="warn" dot>{t('hierarchy.leadership.pending')}</Badge>}
                meta={t('hierarchy.leadership.sentOn', { date: fmtDate(r.createdAt, lang) })}
                actions={
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: 'cancel', request: r })}>
                    {t('hierarchy.leadership.cancel')}
                  </Button>
                }
              />
            ))}
          </>
        )}
      </Section>

      </>
      )}

      {/* Qui me suit (P-HIE-c) — Retirer (D-HIE-04). */}
      {(eligible || overview.followedBy) && (
      <Section title={t('hierarchy.leadership.followedByTitle')} icon="arrowUp">
        {overview.followedBy ? (
          <PersonRow
            person={overview.followedBy.requester}
            meta={
              overview.followedBy.decidedAt
                ? t('hierarchy.leadership.acceptedOn', { date: fmtDate(overview.followedBy.decidedAt, lang) })
                : undefined
            }
            actions={
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: 'revoke', request: overview.followedBy! })}>
                {t('hierarchy.leadership.revoke')}
              </Button>
            }
          />
        ) : (
          <Empty>{t('hierarchy.leadership.followedByEmpty')}</Empty>
        )}
      </Section>
      )}

      <DesignateModal open={designOpen} onClose={() => setDesignOpen(false)} />

      {confirm && (
        <Modal
          open
          onClose={() => !busy && setConfirm(null)}
          title={t(`hierarchy.leadership.confirm.${confirm.kind}Title`)}
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant={confirm.kind === 'accept' ? 'primary' : 'danger'}
                disabled={busy}
                onClick={() => actionM.mutate({ kind: confirm.kind, id: confirm.request.id })}
              >
                {t(`hierarchy.leadership.confirm.${confirm.kind}Ok`)}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--ink-700)', lineHeight: 1.55 }}>
            {confirm.kind === 'accept'
              ? t('hierarchy.leadership.confirm.acceptBody', { requester: confirm.request.requester.fullName, current: confirm.replaced })
              : confirm.kind === 'revoke'
                ? t('hierarchy.leadership.confirm.revokeBody', { name: confirm.request.requester.fullName })
                : t('hierarchy.leadership.confirm.cancelBody', { name: confirm.request.designee.fullName })}
          </p>
        </Modal>
      )}
    </>
  );
}

/** « Désigner un dirigeant » (D-HIE-02) — recherche RG-HIE-32, puis demande (le lien attend la validation). */
function DesignateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQ('');
    }
  }, [open]);

  const candidatesQ = useQuery({
    queryKey: ['leaders', 'designee-candidates', debouncedQ],
    queryFn: () => searchDesigneeCandidates(debouncedQ),
    enabled: open && debouncedQ.length >= 2,
    retry: false,
  });

  const createM = useMutation({
    mutationFn: createSupervisionRequest,
    onSuccess: (data) => {
      applySupervisionOverview(queryClient, data);
      void queryClient.invalidateQueries({ queryKey: ['leaders', 'designee-candidates'] });
      push({ kind: 'ok', title: t('hierarchy.leadership.done.create') });
      onClose();
    },
    onError: (err) =>
      push({ kind: 'error', title: t('hierarchy.leadership.actionFailed'), msg: supervisionErrorMessage(err, t) }),
  });

  const results = candidatesQ.data ?? [];

  return (
    <Modal
      open={open}
      onClose={() => !createM.isPending && onClose()}
      title={t('hierarchy.leadership.designateTitle')}
      sub={t('hierarchy.leadership.designateHint')}
      footer={
        <Button variant="ghost" onClick={onClose} disabled={createM.isPending}>
          {t('common.close')}
        </Button>
      }
    >
      <Field
        label={t('hierarchy.leadership.searchLabel')}
        hint={debouncedQ.length > 0 && debouncedQ.length < 2 ? t('hierarchy.leadership.searchTooShort') : t('hierarchy.leadership.searchHint')}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('hierarchy.leadership.searchPlaceholder')}
          icon={<Icon name="search" size={14} />}
          autoFocus
        />
      </Field>
      {debouncedQ.length >= 2 && (
        <div style={{ marginTop: 6 }}>
          {candidatesQ.isLoading ? (
            <p style={{ color: 'var(--ink-400)', margin: 0 }}>{t('common.loading')}</p>
          ) : candidatesQ.isError ? (
            <p role="alert" style={{ color: 'var(--err)', margin: 0, fontSize: 13 }}>{supervisionErrorMessage(candidatesQ.error, t)}</p>
          ) : results.length === 0 ? (
            <p style={{ color: 'var(--ink-400)', margin: 0, fontStyle: 'italic' }}>{t('hierarchy.leadership.noResult')}</p>
          ) : (
            <div style={{ border: '1px solid var(--line-soft, rgba(42,38,32,0.08))', borderRadius: 10, overflow: 'hidden' }}>
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={createM.isPending}
                  onClick={() => createM.mutate(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid var(--line-soft, rgba(42,38,32,0.06))', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink-900, #1E1B16)' }}>{p.fullName}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{[personLine(p), p.email].filter(Boolean).join(' · ')}</div>
                  </div>
                  {(p.goalRole ?? p.donationRole) && <Badge tone="gray">{t(`roles.${p.goalRole ?? p.donationRole}`)}</Badge>}
                  {!p.active && <Badge tone="gray">{t('users.statusInactive')}</Badge>}
                  <Icon name="plus" size={13} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Section({
  title, icon, count, action, children,
}: { title: string; icon: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Icon name={icon} size={16} />
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        {count != null && count > 0 && <Badge tone="gray">{count}</Badge>}
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13.5 }}>{children}</p>;
}

function PersonRow({
  person, meta, badge, actions,
}: { person: DiscipleshipPerson; meta?: string; badge?: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation();
  const role = person.goalRole ?? person.donationRole;
  const line = personLine(person);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0',
        borderTop: '1px solid var(--line-soft, rgba(42,38,32,0.06))',
      }}
    >
      <Icon name="user" size={14} />
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{person.fullName}</span>
          {role && <Badge tone="gray">{t(`roles.${role}`)}</Badge>}
          {!person.active && <Badge tone="gray">{t('users.statusInactive')}</Badge>}
          {badge}
        </div>
        {(line || meta) && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{[line, meta].filter(Boolean).join(' · ')}</div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>{actions}</div>}
    </div>
  );
}
