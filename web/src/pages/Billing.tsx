import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Table, type Column } from '../components/ui';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { hasMemberSpace, hasMinistryAccess } from '../services/authApi';
import {
  downloadInvoicePdf,
  getMySubscription,
  listMyInvoices,
  listMySubscriptions,
  openBillingPortal,
  type BillingInvoice,
  type BillingSubscription,
  type BillingSubscriptionStatus,
} from '../services/billingApi';
import { saveBlob } from '../utils/download';

// ---------------------------------------------------------------------------------------------
//  Abonnements payants — lot ABO4 (§6.1 du plan du 23/10, contrat `02_Contrat_API_Abonnements.md`).
//  Deux pages HORS shell : /abonnements/retour?ref= et /abonnements/mes-abonnements (authentifiées,
//  tout compte, rattaché ou non — D-ABO-05). P-11 / O12 (JP 27/10, plan 05) : la page publique
//  /abonnements (offre « Frais de couverture », désactivée) est REMPLACÉE par /offres (pages/Offers.tsx),
//  vers laquelle elle redirige ; la mise en page publique ci-dessous lui est partagée.
//  D-ABO-01 (JP 23/10) : payer n'active aucun module — rien ici ne lit ni n'invalide
//  `accessible-modules`. RG-ABO-08 : le statut ne vient que des événements Stripe, jamais du retour
//  navigateur — la page de retour se contente de relire l'abonnement.
// ---------------------------------------------------------------------------------------------

type TFn = ReturnType<typeof useTranslation>['t'];

/**
 * Montant en centimes → « 99,99 € » selon la langue active (§6.4 : l'API ne formate jamais).
 * D-CUR-04 (JP 28/10) : toujours dans la devise de l'abonnement / de la facture (`54,99 $US`, `US$54.99`).
 */
export function fmtCents(cents: number, currency: string, lang: string): string {
  return new Intl.NumberFormat(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { style: 'currency', currency }).format(
    cents / 100,
  );
}

/** Date `AAAA-MM-JJ` (fin incluse, Europe/Paris) affichée telle quelle, sans décalage UTC. */
function fmtLocalDay(iso: string, lang: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return fmtDay(iso, lang);
  return new Date(y, m - 1, d).toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtDay(iso: string | null, lang: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** §9 : chaque code traduit (`billing.errors.*`), repli sur `message`. Réutilisé par la caisse d'un plan (contrat 27/10 §9.2). */
export function billingErrMsg(err: unknown, t: TFn): string {
  const res = (err as { response?: { status?: number; data?: { error?: string; message?: string } } })?.response;
  const code =
    res?.data?.error ??
    (res?.status === 429 ? 'TOO_MANY_REQUESTS' : res?.status === 503 ? 'PAYMENT_PROVIDER_UNAVAILABLE' : null);
  const fallback = res?.data?.message ?? t('common.error');
  return code ? t(`billing.errors.${code}`, { defaultValue: fallback }) : fallback;
}

/** Avec `responseType: 'blob'`, le corps d'erreur arrive en Blob : on le relit en JSON. */
async function blobErrMsg(err: unknown, t: TFn): Promise<string> {
  const res = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (res?.data instanceof Blob) {
    try {
      const data = JSON.parse(await res.data.text()) as { error?: string; message?: string };
      return billingErrMsg({ response: { status: res.status, data } }, t);
    } catch {
      return t('common.error');
    }
  }
  return billingErrMsg(err, t);
}

const STATUS_TONE: Record<BillingSubscriptionStatus, 'ok' | 'warn' | 'gray' | 'err' | 'earth'> = {
  PENDING: 'earth',
  ACTIVE: 'ok',
  PAST_DUE: 'err',
  CANCELED: 'gray',
  EXPIRED: 'gray',
};

function StatusBadgeOf({ status }: { status: BillingSubscriptionStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]} dot>{t(`billing.status.${status}`)}</Badge>;
}

/** Mise en page publique commune (même en-tête que /privacy) — aussi celle de /offres. */
export function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--parchment)', fontFamily: 'var(--font-sans)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--parchment)', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px clamp(16px, 3vw, 24px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--green-600)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontFamily: 'var(--font-serif)' }}>S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: 'var(--green-800)' }}>shephr</span>
          </Link>
          <LangSwitch />
        </div>
      </header>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(28px, 6vw, 48px) 16px clamp(40px, 8vw, 64px)' }}>{children}</main>
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(26px, 7vw, 36px)', lineHeight: 1.15, letterSpacing: '-.02em', color: 'var(--green-900)', margin: '0 0 8px' }}>
        {title}
      </h1>
      {sub && <p style={{ color: 'var(--ink-600)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>{sub}</p>}
    </div>
  );
}

export function Banner({ tone, children }: { tone: 'warn' | 'ok' | 'err'; children: ReactNode }) {
  const bg = tone === 'ok' ? 'var(--ok-bg)' : tone === 'err' ? 'var(--err-bg)' : 'var(--warn-bg)';
  const fg = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : 'var(--warn)';
  return (
    <div role="status" style={{ background: bg, color: fg, borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 14, lineHeight: 1.5, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Icon name={tone === 'ok' ? 'check' : 'info'} size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

export const cardStyle = {
  background: 'var(--ivory-card)',
  border: '1px solid var(--line-soft)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
  padding: 'clamp(18px, 4vw, 26px)',
} as const;

/** Garde des deux pages authentifiées : tout compte connecté (D-ABO-05), sinon /login?next=. */
function useRequireSession(): boolean {
  const { ready, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !isAuthenticated) {
      const next = window.location.pathname + window.location.search;
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    }
  }, [ready, isAuthenticated, navigate]);
  return ready && isAuthenticated;
}

/** Retour vers l'espace de l'utilisateur (même arbitrage que /login). */
function useHomePath(): string {
  const { me } = useAuth();
  if (hasMinistryAccess(me)) return '/dashboard';
  if (hasMemberSpace(me)) return '/my-goals';
  return '/join';
}

// ---------------------------------------------------------------------------------------------
//  /abonnements/retour?ref= — relit l'abonnement toutes les 3 s (10 fois max) tant que PENDING.
// ---------------------------------------------------------------------------------------------

const POLL_MS = 3000;
const POLL_MAX = 10;

export function BillingReturnPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const ref = searchParams.get('ref') ?? '';
  const allowed = useRequireSession();

  const qc = useQueryClient();
  const queryKey = ['billing', 'subscription', ref];
  const subQ = useQuery({
    queryKey,
    queryFn: () => getMySubscription(ref),
    enabled: allowed && ref !== '',
    retry: false,
    // Borné sur le nombre TOTAL de lectures (réussies + en échec) : une relecture en erreur ne
    // touche ni `data` ni `dataUpdateCount`, sans quoi le polling ne s'arrêterait jamais (§6.1).
    // Arrêt à la première erreur.
    refetchInterval: (q) =>
      q.state.status !== 'error' &&
      q.state.data?.status === 'PENDING' &&
      q.state.dataUpdateCount + q.state.errorUpdateCount < POLL_MAX
        ? POLL_MS
        : false,
  });
  const sub = subQ.data;
  const pollState = qc.getQueryState(queryKey);
  const stillPending =
    sub?.status === 'PENDING' &&
    (subQ.isError || (pollState?.dataUpdateCount ?? 0) + (pollState?.errorUpdateCount ?? 0) >= POLL_MAX);

  const mine = (
    <Link to="/abonnements/mes-abonnements" style={{ color: 'var(--green-700)', fontWeight: 600 }}>
      {t('billing.return.mySubscriptions')}
    </Link>
  );

  // JP 27/10 — plan PERSONNEL « Suivi de ma hiérarchie » (sans ville) : retour vers la Hiérarchie,
  // page 3 « Vie de mon leadership » depuis D-HIE-01 (JP 28/10).
  // Plan personnel = formule sans ville (D-ABO-33), pas un code en dur : une autre offre USER marche aussi.
  const hierarchyPlan = !!sub?.planCode && !sub.localityId;
  const cityLink = hierarchyPlan ? (
    <Link to="/hierarchy/vie" style={{ color: 'var(--green-700)', fontWeight: 600 }}>
      {t('billing.plan.backToHierarchy')}
    </Link>
  ) : sub?.planCode && sub.localityId ? (
      <Link
        to={`/study/city?localityId=${encodeURIComponent(sub.localityId)}&tab=subscription`}
        style={{ color: 'var(--green-700)', fontWeight: 600 }}
      >
        {t('billing.plan.backToCity')}
      </Link>
    ) : null;

  let content: ReactNode;
  if (!allowed || (ref !== '' && subQ.isLoading)) {
    content = <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>;
  } else if (ref === '' || (subQ.isError && !sub)) {
    // Une relecture en échec après une 1re lecture garde le dernier statut connu (bannière ci-dessous).
    content = (
      <>
        <Banner tone="err">{ref === '' ? t('billing.return.noRef') : billingErrMsg(subQ.error, t)}</Banner>
        <p>{mine}</p>
      </>
    );
  } else if (sub?.status === 'ACTIVE' || sub?.status === 'PAST_DUE') {
    content = (
      <>
        {/* D-ABO-29 (JP 27/10) : retour d'un PLAN (église-ville) → « le suivi de la ville est activé »,
            avec un lien vers /study/city. L'ouverture du droit vient du webhook (RG-ABO-25) : on ne
            l'affiche qu'une fois l'abonnement relu ACTIVE / PAST_DUE. */}
        <Banner tone="ok">
          {hierarchyPlan
            ? t('billing.plan.hierarchyActivated')
            : sub.planCode
            ? t('billing.plan.activated', { city: sub.localityName ?? '—' })
            : t('billing.return.active', { reference: sub.reference })}
        </Banner>
        <p style={{ color: 'var(--ink-600)', fontSize: 14 }}>{t('billing.return.emailNote')}</p>
        <p style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {cityLink}
          {mine}
        </p>
      </>
    );
  } else if (sub?.status === 'PENDING') {
    content = (
      <>
        <Banner tone="warn">{stillPending ? t('billing.return.slow') : t('billing.return.pending')}</Banner>
        <p style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {cityLink}
          {mine}
        </p>
      </>
    );
  } else {
    content = (
      <>
        <Banner tone="err">{t('billing.return.notCompleted')}</Banner>
        <p>
          {/* D-ABO-29 : un plan se souscrit depuis le suivi de la ville ; O12 (plan 05) : les offres sont sur /offres. */}
          {cityLink ?? (
            <Link to="/offres" style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.return.backToOffers')}</Link>
          )}
        </p>
      </>
    );
  }

  return (
    <BillingLayout>
      <PageTitle title={t('billing.return.title')} />
      {content}
    </BillingLayout>
  );
}

// ---------------------------------------------------------------------------------------------
//  /abonnements/mes-abonnements — D-ABO-07 : le payeur seul. Portail Stripe (D-ABO-11), factures.
// ---------------------------------------------------------------------------------------------

export function MySubscriptionsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { push } = useToast();
  const allowed = useRequireSession();
  const home = useHomePath();
  const [downloading, setDownloading] = useState<string | null>(null);

  const subsQ = useQuery({ queryKey: ['billing', 'subscriptions'], queryFn: listMySubscriptions, enabled: allowed });
  const invoicesQ = useQuery({ queryKey: ['billing', 'invoices'], queryFn: listMyInvoices, enabled: allowed });

  const portalM = useMutation({
    mutationFn: (reference: string) => openBillingPortal(reference),
    onSuccess: (res) => window.location.assign(res.url),
    onError: (err) => push({ kind: 'error', title: t('billing.mine.portalFailed'), msg: billingErrMsg(err, t) }),
  });

  const download = async (inv: BillingInvoice) => {
    setDownloading(inv.number);
    try {
      const blob = await downloadInvoicePdf(inv.number);
      saveBlob(blob, `${inv.number}.pdf`);
    } catch (err) {
      push({ kind: 'error', title: t('billing.mine.downloadFailed'), msg: await blobErrMsg(err, t) });
    } finally {
      setDownloading(null);
    }
  };

  const invoiceCols: Column<BillingInvoice & { id: string }>[] = [
    { label: t('billing.invoice.date'), render: (i) => <span style={{ fontWeight: 500 }}>{fmtDay(i.issuedAt, lang)}</span> },
    { label: t('billing.invoice.number'), render: (i) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{i.number}</span> },
    {
      label: t('billing.invoice.period'),
      render: (i) => (
        <span style={{ color: 'var(--ink-600)', fontSize: 13 }}>
          {i.periodStart ? `${fmtDay(i.periodStart, lang)} → ${fmtDay(i.periodEnd, lang)}` : '—'}
        </span>
      ),
    },
    {
      label: t('billing.invoice.amount'),
      render: (i) => (
        <div>
          <div>{fmtCents(i.totalCents, i.currency, lang)}</div>
          {i.refundedCents > 0 && (
            <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>
              {t('billing.invoice.refunded', { amount: fmtCents(i.refundedCents, i.currency, lang) })}
            </div>
          )}
        </div>
      ),
    },
    {
      label: '',
      render: (i) => (
        <Button size="sm" variant="secondary" iconL={<Icon name="download" size={13} />} disabled={downloading === i.number} onClick={() => download(i)}>
          {t('billing.invoice.download')}
        </Button>
      ),
    },
  ];

  const subs = subsQ.data ?? [];

  return (
    <BillingLayout>
      <PageTitle title={t('billing.mine.title')} sub={t('billing.mine.subtitle')} />
      <p style={{ margin: '-8px 0 22px', fontSize: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link to={home} style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.mine.backToSpace')}</Link>
        <Link to="/offres" style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.mine.seeOffers')}</Link>
      </p>

      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '0 0 12px' }}>
        {t('billing.mine.subscriptions')}
      </h2>
      {!allowed || subsQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : subsQ.isError ? (
        <p style={{ color: 'var(--err)' }}>{billingErrMsg(subsQ.error, t)}</p>
      ) : subs.length === 0 ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('billing.mine.noSubscription')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 8 }}>
          {subs.map((s) => (
            <SubscriptionCard key={s.reference} sub={s} lang={lang} portalPending={portalM.isPending} onPortal={() => portalM.mutate(s.reference)} />
          ))}
        </div>
      )}

      <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20, color: 'var(--green-800)', margin: '30px 0 12px' }}>
        {t('billing.mine.invoices')}
      </h2>
      {!allowed || invoicesQ.isLoading ? (
        <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
      ) : invoicesQ.isError ? (
        <p style={{ color: 'var(--err)' }}>{billingErrMsg(invoicesQ.error, t)}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table
            columns={invoiceCols}
            rows={(invoicesQ.data ?? []).map((i) => ({ ...i, id: i.number }))}
            zebra
            empty={<p style={{ color: 'var(--ink-500)', margin: 0, fontSize: 13.5 }}>{t('billing.mine.noInvoice')}</p>}
          />
        </div>
      )}
    </BillingLayout>
  );
}

function SubscriptionCard({
  sub,
  lang,
  portalPending,
  onPortal,
}: {
  sub: BillingSubscription;
  lang: string;
  portalPending: boolean;
  onPortal: () => void;
}) {
  const { t } = useTranslation();
  // P-07 (JP 27/10, plan 05) : un abonnement VOUCHER (code d'activation, D-OFF-08) est affiché — statut
  // et date de fin — mais SANS facture ni portail Stripe (aucun client Stripe derrière).
  const voucher = sub.source === 'VOUCHER';
  // §4.4 : pas de client Stripe tant que PENDING / EXPIRED (422 BILLING_PORTAL_UNAVAILABLE).
  const portal = !voucher && sub.source !== 'MANUEL' && sub.status !== 'PENDING' && sub.status !== 'EXPIRED';
  const voucherEnd = sub.manualEndDate ?? sub.currentPeriodEnd;
  return (
    <div style={{ ...cardStyle, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Contrat 27/10 §5.3 : un plan s'affiche « {offerName} — {localityName} ». */}
          <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 18, color: 'var(--green-800)' }}>
            {sub.planCode && sub.localityName ? `${sub.offerName} — ${sub.localityName}` : sub.offerName}
          </strong>
          <StatusBadgeOf status={sub.status} />
        </div>
        <div style={{ color: 'var(--ink-500)', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>{sub.reference}</div>
        {voucher ? (
          <div style={{ color: 'var(--ink-600)', fontSize: 13 }}>
            {t('billing.mine.voucher')}
            {voucherEnd && <> · {t('billing.mine.voucherUntil', { date: fmtLocalDay(voucherEnd, lang) })}</>}
          </div>
        ) : (
          <div style={{ fontSize: 15 }}>
            {sub.discountPercent != null && sub.listPriceCents !== sub.priceCents && (
              <span style={{ color: 'var(--ink-400)', textDecoration: 'line-through', marginRight: 8 }}>
                {fmtCents(sub.listPriceCents, sub.currency, lang)}
              </span>
            )}
            <strong>{fmtCents(sub.priceCents, sub.currency, lang)}</strong>{' '}
            <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>{t(`billing.period.${sub.billingPeriod}`)}</span>
            {sub.promoCode && (
              <span style={{ marginLeft: 8 }}>
                <Badge tone="earth">{t('billing.mine.promo', { code: sub.promoCode, percent: sub.discountPercent ?? 0 })}</Badge>
              </span>
            )}
          </div>
        )}
        {sub.ministryName && <div style={{ color: 'var(--ink-600)', fontSize: 13 }}>{t('billing.mine.ministry', { name: sub.ministryName })}</div>}
        {!!sub.planCode && !sub.localityId && (
          // JP 27/10 — plan personnel : le bénéficiaire est le payeur ; lien vers la Hiérarchie.
          <div style={{ color: 'var(--ink-600)', fontSize: 13 }}>
            {t('billing.plan.personal')}{' · '}
            <Link to="/hierarchy/vie" style={{ color: 'var(--green-700)', fontWeight: 600 }}>
              {t('billing.plan.backToHierarchy')}
            </Link>
          </div>
        )}
        {sub.planCode && sub.localityId && (
          <div style={{ color: 'var(--ink-600)', fontSize: 13 }}>
            {t('billing.plan.city', { name: sub.localityName ?? '—' })}{' · '}
            <Link to={`/study/city?localityId=${encodeURIComponent(sub.localityId)}&tab=subscription`} style={{ color: 'var(--green-700)', fontWeight: 600 }}>
              {t('billing.plan.backToCity')}
            </Link>
          </div>
        )}
        {voucher ? null : sub.cancelAtPeriodEnd && sub.status !== 'CANCELED' ? (
          <div style={{ color: 'var(--warn)', fontSize: 13 }}>{t('billing.mine.cancelRequested', { date: fmtDay(sub.currentPeriodEnd, lang) })}</div>
        ) : sub.currentPeriodEnd && (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE') ? (
          <div style={{ color: 'var(--ink-600)', fontSize: 13 }}>{t('billing.mine.nextDue', { date: fmtDay(sub.currentPeriodEnd, lang) })}</div>
        ) : null}
        {sub.status === 'CANCELED' && sub.canceledAt && (
          <div style={{ color: 'var(--ink-600)', fontSize: 13 }}>{t('billing.mine.canceledOn', { date: fmtDay(sub.canceledAt, lang) })}</div>
        )}
        {sub.status === 'PAST_DUE' && <div style={{ color: 'var(--err)', fontSize: 13 }}>{t('billing.mine.pastDueHint')}</div>}
        {sub.status === 'PENDING' && <div style={{ color: 'var(--ink-500)', fontSize: 13 }}>{t('billing.mine.pendingHint')}</div>}
      </div>
      {portal && (
        <Button variant={sub.status === 'PAST_DUE' ? 'primary' : 'secondary'} disabled={portalPending} onClick={onPortal}>
          {sub.status === 'PAST_DUE' ? t('billing.mine.updateCard') : t('billing.mine.manage')}
        </Button>
      )}
    </div>
  );
}
