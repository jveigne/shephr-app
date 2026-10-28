import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { hasMinistryAccess, ledAssemblyIds, type MeResponse } from '../services/authApi';
import { Badge, Button, Field, Input } from './ui';
import { Icon } from './Icon';
import {
  ENTITLEMENT_HIERARCHIE_SUIVI,
  PLAN_DIRIGEANT_HIERARCHIE,
  getEntitlements,
  getPersonalEntitlements,
  type ModuleAccessDeniedDetails,
  type PersonalPlan,
  type PlanOffer,
} from '../services/entitlementsApi';
import { checkout, openBillingPortal, previewPromo, type BillingCurrency, type BillingPeriod, type PromoPreview } from '../services/billingApi';
import { billingErrMsg, fmtCents, fmtDay } from '../pages/Billing';
import { LocalPriceLine, VoucherRedeemModal } from './VoucherRedeemModal';
import { CurrencyToggle, EurOnlyNote } from './CurrencyToggle';
import { centsFor, currenciesOf, hasAnnualPrice, priceFor, pricesOf, useCurrencyChoice } from '../utils/currency';

// ---------------------------------------------------------------------------------------------
//  Écran de verrou « Fonctionnalité incluse dans l'abonnement de votre église » — lot « pro-plan »
//  (contrat 27/10 §9.2, D-WEB-07). Affiché À LA PLACE du contenu sur tout 403 `MODULE_ACCESS_DENIED`
//  `ETUDE_SUIVI` (jamais un toast d'erreur), et d'avance quand `GET /study/localities` dit
//  `entitled = false`.
//  - Aperçu flouté = GABARIT FICTIF codé ici, jamais de vraies données (§9.1).
//  - `canSubscribe` (RG-ABO-22, calculé par le serveur) : Mensuel / Annuel, code promo facultatif,
//    « S'abonner — {prix}/mois » → `POST /billing/checkout` → `window.location = url`. Prix =
//    `GET /entitlements` › `plans[0]`, en centimes du serveur, jamais recalculé (RG-ABO-05).
//  - Sinon : « Demandez à votre pasteur d'activer le suivi de la ville. » — aucun bouton.
//  - États d'un abonnement existant : PENDING (paiement en cours, pas de bouton), PAST_DUE hors grâce
//    (payeur → « Mettre à jour ma carte » ; autres → « géré par {payerName} »).
//  RG-ABO-25 : l'ouverture du droit vient du webhook seul — le retour Stripe relit l'abonnement.
//  D-ABO-13 / RG-ABO-24 : web seulement — le mobile a `StudyCityLock`, sans paiement.
//  Plan 05 (JP 27/10) : libellé « Offre Néhémie — le suivi de toute ma ville » (§3.8) ; seconde voie
//  « J'ai un code » (voucher Mobile Money, D-OFF-08) à côté de la carte Stripe, avec le prix local
//  (`localPriceLabel`) ; lien « Voir les offres » → `/offres?offer=nehemie` sous l'aperçu flouté.
// ---------------------------------------------------------------------------------------------

/** Lien « Voir les offres » des aperçus floutés (plan 05 §3.8) — la page /offres défile jusqu'à la carte. */
function SeeOffersLink({ offer }: { offer: 'caleb' | 'nehemie' }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/offres?offer=${offer}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, color: 'var(--green-700)', fontWeight: 600, fontSize: 13.5 }}
    >
      {t('offers.seeOffers')}
      <Icon name="arrowRight" size={13} />
    </Link>
  );
}

/** Bouton « J'ai un code » (D-OFF-08) + ligne du prix local ; ouvre la modale de saisie. */
function VoucherEntry({
  plan,
  localityId,
  cityName,
  localPriceLabel,
}: {
  plan: 'caleb' | 'nehemie';
  localityId?: string;
  cityName?: string | null;
  localPriceLabel: string | null | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
      <Button variant="secondary" iconL={<Icon name="tag" size={14} />} onClick={() => setOpen(true)} style={{ justifyContent: 'center' }}>
        {t('offers.voucher.open')}
      </Button>
      <LocalPriceLine label={localPriceLabel} style={{ textAlign: 'center' }} />
      <VoucherRedeemModal
        open={open}
        onClose={() => setOpen(false)}
        plan={plan}
        cities={plan === 'nehemie' && localityId ? [{ localityId, localityName: cityName ?? '—' }] : []}
        localPriceLabel={localPriceLabel}
      />
    </div>
  );
}

/** Lignes du gabarit fictif (§9.1 : aucune donnée réelle derrière le flou). */
const FAKE_ROWS = [
  { letter: 'A', done: 7, total: 12 },
  { letter: 'B', done: 4, total: 12 },
  { letter: 'C', done: 10, total: 12 },
  { letter: 'D', done: 2, total: 12 },
];

function FakePreview() {
  const { t } = useTranslation();
  return (
    <div aria-hidden="true" style={{ filter: 'blur(5px)', opacity: 0.7, pointerEvents: 'none', userSelect: 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[38, 112, 64, 71].map((n, i) => (
          <div key={i} className="card" style={{ padding: 14 }}>
            <div style={{ height: 8, width: '60%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 10 }} />
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--green-700)' }}>{n}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 14 }}>
        {FAKE_ROWS.map((r) => (
          <div key={r.letter} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span style={{ width: 120, fontSize: 13 }}>{t('cityStudy.lock.fakeAssembly', { letter: r.letter })}</span>
            <div style={{ flex: 1, height: 8, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(100 * r.done) / r.total}%`, height: '100%', background: 'var(--green-600)' }} />
            </div>
            <span style={{ fontSize: 12.5 }}>{r.done}/{r.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LockedFeature({
  denied,
  compact = false,
  tab,
}: {
  /** Détails du 403 (ou équivalent construit depuis `GET /study/localities`). `nodeId` = la ville. */
  denied: ModuleAccessDeniedDetails;
  /**
   * Variante compacte (contrat §12.1 : vue d'une autre assemblée / vue d'ensemble dans `/study`) :
   * message + lien vers `/study/city`, sans aperçu ni caisse.
   */
  compact?: boolean;
  /**
   * P-08 (JP 27/10, plan 05) : onglet de la page « Suivi de la ville » ouvert par le lien compact
   * (`journal`, `events`…) ; absent = onglet par défaut. Même verrou pour tous les codes de ville de
   * l'offre Néhémie (`ETUDE_SUIVI`, `JOURNAL`, `EVENEMENTS_SUIVI`).
   */
  tab?: string;
}) {
  const { t } = useTranslation();
  const cityId = denied.nodeId;
  const tabParam = tab ? `&tab=${encodeURIComponent(tab)}` : '';
  const cityHref = cityId ? `/study/city?localityId=${encodeURIComponent(cityId)}${tabParam}` : '/study/city';

  if (compact) {
    return (
      <div className="card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--parchment)', display: 'grid', placeItems: 'center', color: 'var(--earth-700)', flexShrink: 0 }}>
          <Icon name="lock" size={17} />
        </div>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontWeight: 600, color: 'var(--green-800)', marginBottom: 4 }}>{t('cityStudy.lock.title')}</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.5 }}>
            {denied.canSubscribe ? t('cityStudy.lock.compactSubscribe') : t('cityStudy.lock.askPastor')}
          </div>
        </div>
        {cityId && (
          <Link to={cityHref} className="btn secondary sm" style={{ alignSelf: 'center' }}>
            {t('cityStudy.lock.openCity')}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: 360 }}>
      <FakePreview />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16 }}>
        <div className="card" style={{ maxWidth: 480, width: '100%', padding: 'clamp(18px, 4vw, 26px)', boxShadow: 'var(--shadow-md, var(--shadow-sm))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Icon name="lock" size={18} style={{ color: 'var(--earth-700)' }} />
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 19, color: 'var(--green-800)' }}>
              {t('cityStudy.lock.title')}
            </h2>
          </div>
          {cityId ? <LockActions localityId={cityId} fallbackCanSubscribe={denied.canSubscribe} /> : (
            <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14 }}>{t('cityStudy.lock.askPastor')}</p>
          )}
          <SeeOffersLink offer="nehemie" />
        </div>
      </div>
    </div>
  );
}

/** Contenu actionnable du verrou pour UNE ville : état d'abonnement, puis caisse si `canSubscribe`. */
function LockActions({ localityId, fallbackCanSubscribe }: { localityId: string; fallbackCanSubscribe: boolean }) {
  const { t } = useTranslation();
  const entQ = useQuery({
    queryKey: ['entitlements', localityId],
    queryFn: () => getEntitlements(localityId),
    retry: false,
  });

  const portalM = useMutation({
    mutationFn: (reference: string) => openBillingPortal(reference),
    onSuccess: (res) => window.location.assign(res.url),
  });

  if (entQ.isLoading) return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 14 }}>{t('common.loading')}</p>;

  const ent = entQ.data;
  const canSubscribe = ent ? ent.canSubscribe : fallbackCanSubscribe;
  const subs = ent?.subscriptions ?? [];
  const pending = subs.find((s) => s.status === 'PENDING');
  const pastDue = subs.find((s) => s.status === 'PAST_DUE' && !s.entitled);
  const other = subs.find((s) => s.status !== 'PENDING' && s.status !== 'EXPIRED' && !s.entitled && s !== pastDue);

  if (pending) {
    return <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14 }}>{t('cityStudy.lock.pending')}</p>;
  }
  if (pastDue) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, color: 'var(--err)', fontSize: 14 }}>{t('cityStudy.lock.pastDue')}</p>
        {pastDue.paidByMe && pastDue.source === 'STRIPE' ? (
          <>
            <Button variant="primary" disabled={portalM.isPending} onClick={() => portalM.mutate(pastDue.reference)} style={{ justifyContent: 'center' }}>
              {t('cityStudy.lock.updateCard')}
            </Button>
            {portalM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(portalM.error, t)}</p>}
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14 }}>
            {t('cityStudy.lock.managedBy', { name: pastDue.payerName ?? t('cityStudy.subscription.unknownPayer') })}
          </p>
        )}
      </div>
    );
  }
  if (other && !other.paidByMe) {
    return (
      <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14 }}>
        {t('cityStudy.lock.managedBy', { name: other.payerName ?? t('cityStudy.subscription.unknownPayer') })}
      </p>
    );
  }
  const plan = ent?.plans?.[0];
  if (!canSubscribe || !plan) {
    return <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14 }}>{t('cityStudy.lock.askPastor')}</p>;
  }
  return <SubscribeForm localityId={localityId} plan={plan} cityName={ent?.localityName ?? null} />;
}

function SubscribeForm({ localityId, plan, cityName }: { localityId: string; plan: PlanOffer; cityName: string | null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ period: BillingPeriod; currency: BillingCurrency; p: PromoPreview } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const normalized = code.trim().toUpperCase();
  // D-CUR-03 / RG-CUR-20 (JP 28/10) : ligne `PlanPrice` de la devise choisie, sinon EUR (mention).
  const [chosen] = useCurrencyChoice();
  const prices = pricesOf(plan);
  const sel = priceFor(prices, chosen);
  const currency: BillingCurrency = sel?.price.currency ?? 'EUR';
  // RG-CUR-22 : l'annuel doit exister DANS la devise affichée.
  const hasAnnual = hasAnnualPrice(sel?.price);
  const effPeriod: BillingPeriod = hasAnnual ? period : 'MONTHLY';

  // RG-ABO-05 : prix TOUJOURS en centimes du serveur — catalogue (`plans[0].prices`) ou aperçu du code.
  const listCents = sel ? centsFor(sel.price, effPeriod) : plan.monthlyPriceCents;
  const promo = preview && preview.period === effPeriod && preview.currency === currency ? preview.p : null;
  const priceCents = promo ? promo.priceCents : listCents;
  const priceLabel = fmtCents(priceCents, promo?.currency ?? currency, lang);

  const previewM = useMutation({
    mutationFn: (v: { period: BillingPeriod; currency: BillingCurrency }) => previewPromo(normalized, plan.offerCode, v.period, v.currency),
    onMutate: () => {
      setPromoError(null);
      setPreview(null);
    },
    onSuccess: (p, v) => setPreview({ period: v.period, currency: v.currency, p }),
    onError: (err) => setPromoError(billingErrMsg(err, t)),
  });

  // RG-CUR-21 : changer de devise relance l'aperçu d'un code déjà appliqué (il ne vaut que pour sa devise).
  const appliedFor = preview ? `${preview.period}/${preview.currency}` : null;
  useEffect(() => {
    if (!appliedFor || !normalized || previewM.isPending) return;
    if (appliedFor !== `${effPeriod}/${currency}`) previewM.mutate({ period: effPeriod, currency });
    // Seule la devise déclenche ici ; la période relance déjà l'aperçu à son clic.
  }, [currency]);

  // RG-ABO-05 / §14.2 n°6 : le code promo ne part à la caisse QUE s'il a été appliqué (aperçu valide)
  // pour la période affichée — le prix du bouton est alors exactement celui facturé par Stripe. Un code
  // saisi mais non appliqué (ou refusé) ne part pas : la souscription se fait au prix catalogue affiché.
  // D-CUR-04 (JP 28/10) : la caisse part dans la devise AFFICHÉE (EUR si la devise choisie manque).
  const checkoutM = useMutation({
    mutationFn: () => checkout(plan.offerCode, promo ? normalized : null, { localityId, period: effPeriod, currency }),
    onSuccess: (res) => window.location.assign(res.url),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14, lineHeight: 1.5 }}>
        {t('cityStudy.lock.subscribeIntro', { plan: plan.name, city: cityName ?? '—' })}
      </p>
      {/* D-CUR-03 (JP 28/10, RG-CUR-19) : sélecteur € / $ au-dessus de Mensuel / Annuel. */}
      <CurrencyToggle available={currenciesOf(plan)} />
      {hasAnnual && (
        <div role="radiogroup" aria-label={t('cityStudy.lock.period')} style={{ display: 'flex', gap: 6 }}>
          {(['MONTHLY', 'ANNUAL'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={effPeriod === p}
              onClick={() => {
                if (p === effPeriod) return;
                setPeriod(p);
                // Changement de période : l'aperçu ne vaut que pour sa période, on le refait pour la nouvelle.
                if (preview && normalized) previewM.mutate({ period: p, currency });
              }}
              className={`btn sm ${effPeriod === p ? 'primary' : 'secondary'}`}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {t(`cityStudy.lock.periods.${p}`)}
            </button>
          ))}
        </div>
      )}
      <div>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--green-700)' }}>{priceLabel}</span>
        <span style={{ color: 'var(--ink-500)', fontSize: 13, marginLeft: 6 }}>{t(`billing.period.${effPeriod}`)}</span>
        {promo && (
          <span style={{ marginLeft: 8 }}>
            <Badge tone="earth">-{promo.percentOff} %</Badge>
          </span>
        )}
        <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>{t('billing.offers.vatIncluded', { rate: plan.vatRate })}</div>
        <EurOnlyNote show={!!sel?.fallback} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (normalized) previewM.mutate({ period: effPeriod, currency });
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
      >
        <Field label={t('billing.promo.label')} style={{ flex: '1 1 160px', margin: 0 }}>
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setPreview(null);
              setPromoError(null);
            }}
            placeholder={t('billing.promo.placeholder')}
            icon={<Icon name="tag" size={15} />}
            autoComplete="off"
            maxLength={32}
          />
        </Field>
        <Button type="submit" size="sm" variant="secondary" disabled={!normalized || previewM.isPending}>
          {previewM.isPending ? t('billing.promo.checking') : t('billing.promo.apply')}
        </Button>
      </form>
      {promoError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{promoError}</p>}
      <Button
        variant="primary"
        style={{ justifyContent: 'center' }}
        disabled={checkoutM.isPending || previewM.isPending}
        onClick={() => checkoutM.mutate()}
      >
        {checkoutM.isPending
          ? t('billing.offers.redirecting')
          : t(effPeriod === 'ANNUAL' ? 'cityStudy.lock.subscribeAnnual' : 'cityStudy.lock.subscribeMonthly', { price: priceLabel })}
      </Button>
      {checkoutM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(checkoutM.error, t)}</p>}
      <p style={{ margin: 0, color: 'var(--ink-400)', fontSize: 12 }}>{t('billing.offers.stripeNote')}</p>
      {/* D-OFF-08 (JP 27/10) : le web affiche TOUJOURS les deux voies — carte (€ ou $, D-CUR-03) et code Mobile Money. */}
      <VoucherEntry plan="nehemie" localityId={localityId} cityName={cityName} localPriceLabel={plan.localPriceLabel} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  Verrou du SUIVI DE LA HIÉRARCHIE — suite du lot « pro-plan » (JP 27/10, D-ABO-31 et suivantes).
//  Plan PERSONNEL « Suivi de ma hiérarchie » (`DIRIGEANT_HIERARCHIE`, code `HIERARCHIE_SUIVI`) : axe
//  de la CHAÎNE de leadership, indépendant du suivi de la ville (`ETUDE_SUIVI`) — un abonnement de
//  ville n'ouvre rien ici, et inversement. Chaque dirigeant paie pour LUI-MÊME.
//  - UN seul verrou pour les deux blocs payants (Vie d'assemblée + Le Message de Bertoua), aperçu
//    flouté FICTIF (jamais de vraies données).
//  - `canSubscribe` (serveur) : « S'abonner — {prix}/mois|/an » → `POST /billing/checkout` SANS
//    `localityId` ; Mensuel / Annuel si l'offre a un prix annuel (D-MKT-03, JP 28/10 — lève
//    « mensuel seulement » de D-ABO-35, RG-MKT-30) ; prix = centimes du serveur (RG-ABO-05).
//  - Sinon : « Demandez l'activation à l'équipe Shephr. » — aucun bouton.
//  - Abonné et payeur : statut + « Gérer l'abonnement » (portail Stripe, retour sur /hierarchy/vie —
//    D-HIE-01, JP 28/10 : page 3 « Vie de mon leadership »).
//  D-ABO-13 : web seulement — le mobile affiche un texte neutre, sans paiement.
//  Plan 05 (JP 27/10) : « Offre Caleb — le suivi de ma hiérarchie » ; « J'ai un code » (voucher,
//  D-OFF-08) à côté de la carte ; lien « Voir les offres » → `/offres?offer=caleb`.
// ---------------------------------------------------------------------------------------------

function FakeHierarchyPreview() {
  const { t } = useTranslation();
  return (
    <div aria-hidden="true" style={{ filter: 'blur(5px)', opacity: 0.7, pointerEvents: 'none', userSelect: 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[24, '9 / 12', 2, 18].map((n, i) => (
          <div key={i} className="card" style={{ padding: 14 }}>
            <div style={{ height: 8, width: '60%', background: 'var(--line-soft)', borderRadius: 4, marginBottom: 10 }} />
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--green-700)' }}>{n}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 14 }}>
        {FAKE_ROWS.map((r) => (
          <div key={r.letter} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span style={{ width: 120, fontSize: 13 }}>{t('cityStudy.lock.fakeAssembly', { letter: r.letter })}</span>
            <div style={{ flex: 1, height: 8, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(100 * r.done) / r.total}%`, height: '100%', background: 'var(--green-600)' }} />
            </div>
            <span style={{ fontSize: 12.5 }}>{r.done}/{r.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HierarchyLockedFeature({ plan }: { plan: PersonalPlan | null }) {
  const { t } = useTranslation();
  return (
    <div style={{ position: 'relative', minHeight: 340, marginBottom: 12 }}>
      <FakeHierarchyPreview />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16 }}>
        <div className="card" style={{ maxWidth: 480, width: '100%', padding: 'clamp(18px, 4vw, 26px)', boxShadow: 'var(--shadow-md, var(--shadow-sm))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Icon name="lock" size={18} style={{ color: 'var(--earth-700)' }} />
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 19, color: 'var(--green-800)' }}>
              {t('hierarchy.lock.title')}
            </h2>
          </div>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-600)', fontSize: 14, lineHeight: 1.5 }}>{t('hierarchy.lock.intro')}</p>
          <PersonalLockActions plan={plan} />
          <SeeOffersLink offer="caleb" />
        </div>
      </div>
    </div>
  );
}

function PersonalLockActions({ plan }: { plan: PersonalPlan | null }) {
  const { t, i18n } = useTranslation();
  const portalM = useMutation({
    mutationFn: (reference: string) => openBillingPortal(reference),
    onSuccess: (res) => window.location.assign(res.url),
  });
  // D-MKT-03 (JP 28/10, RG-MKT-30) : Mensuel ou Annuel ; jamais de `localityId`
  // (400 `PERSONAL_PLAN_LOCALITY_FORBIDDEN`).
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  // D-CUR-03 / 04 (JP 28/10) : devise choisie (partagée avec /offres) envoyée à la caisse.
  const [chosen] = useCurrencyChoice();
  const checkoutM = useMutation({
    mutationFn: (v: { offerCode: string; period: BillingPeriod; currency: BillingCurrency }) =>
      checkout(v.offerCode, null, { period: v.period, currency: v.currency }),
    onSuccess: (res) => window.location.assign(res.url),
  });

  const sub = plan?.subscription ?? null;
  if (sub?.status === 'PENDING') {
    return <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14 }}>{t('hierarchy.lock.pending')}</p>;
  }
  if (sub?.status === 'PAST_DUE' && !plan?.entitled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, color: 'var(--err)', fontSize: 14 }}>{t('hierarchy.lock.pastDue')}</p>
        {sub.source === 'STRIPE' && (
          <Button variant="primary" disabled={portalM.isPending} onClick={() => portalM.mutate(sub.reference)} style={{ justifyContent: 'center' }}>
            {t('cityStudy.lock.updateCard')}
          </Button>
        )}
        {portalM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(portalM.error, t)}</p>}
      </div>
    );
  }
  if (!plan || !plan.canSubscribe) {
    return <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 14 }}>{t('hierarchy.lock.askShephr')}</p>;
  }
  // RG-ABO-05 : prix TOUJOURS en centimes du serveur, jamais recalculé. RG-CUR-20 / 22 (JP 28/10) :
  // ligne de la devise choisie (sinon EUR, avec mention) ; l'annuel doit exister dans cette devise.
  const sel = priceFor(pricesOf(plan), chosen);
  const currency: BillingCurrency = sel?.price.currency ?? 'EUR';
  const hasAnnual = hasAnnualPrice(sel?.price);
  const effPeriod: BillingPeriod = hasAnnual ? period : 'MONTHLY';
  const cents = sel ? centsFor(sel.price, effPeriod) : plan.monthlyPriceCents;
  const price = fmtCents(cents, currency, i18n.language);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* D-CUR-03 (JP 28/10, RG-CUR-19) : sélecteur € / $ au-dessus de Mensuel / Annuel. */}
      <CurrencyToggle available={currenciesOf(plan)} />
      {hasAnnual && (
        <div role="radiogroup" aria-label={t('cityStudy.lock.period')} style={{ display: 'flex', gap: 6 }}>
          {(['MONTHLY', 'ANNUAL'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={effPeriod === p}
              onClick={() => {
                setPeriod(p);
                checkoutM.reset();
              }}
              className={`btn sm ${effPeriod === p ? 'primary' : 'secondary'}`}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {t(`cityStudy.lock.periods.${p}`)}
            </button>
          ))}
        </div>
      )}
      <div>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--green-700)' }}>{price}</span>
        <span style={{ color: 'var(--ink-500)', fontSize: 13, marginLeft: 6 }}>{t(`billing.period.${effPeriod}`)}</span>
        {/* D-MKT-04 (JP 28/10) : pastille « Annuel : 2 mois offerts » quand l'annuel existe. */}
        {hasAnnual && (
          <span style={{ marginLeft: 8 }}>
            <Badge tone="earth">{t('offers.annualBadge')}</Badge>
          </span>
        )}
        <div style={{ color: 'var(--ink-500)', fontSize: 12 }}>{t('hierarchy.lock.vatIncluded', { plan: plan.offerName })}</div>
        <EurOnlyNote show={!!sel?.fallback} />
      </div>
      <Button
        variant="primary"
        style={{ justifyContent: 'center' }}
        disabled={checkoutM.isPending}
        onClick={() => checkoutM.mutate({ offerCode: plan.offerCode, period: effPeriod, currency })}
      >
        {checkoutM.isPending
          ? t('billing.offers.redirecting')
          : t(effPeriod === 'ANNUAL' ? 'cityStudy.lock.subscribeAnnual' : 'cityStudy.lock.subscribeMonthly', { price })}
      </Button>
      {checkoutM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(checkoutM.error, t)}</p>}
      <p style={{ margin: 0, color: 'var(--ink-400)', fontSize: 12 }}>{t('billing.offers.stripeNote')}</p>
      {/* D-OFF-08 (JP 27/10) : seconde voie, code d'activation (droit personnel, sans ville). */}
      <VoucherEntry plan="caleb" localPriceLabel={plan.localPriceLabel} />
    </div>
  );
}

/**
 * Bandeau d'état du plan personnel quand le droit est ouvert : statut, échéance, et « Gérer
 * l'abonnement » (portail Stripe) — l'appelant est toujours le payeur d'un plan personnel. Droit
 * ouvert sans abonnement (accord de ministère, superAdmin) : rien.
 */
export function HierarchySubscriptionStatus({ plan }: { plan: PersonalPlan | null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const portalM = useMutation({
    mutationFn: (reference: string) => openBillingPortal(reference),
    onSuccess: (res) => window.location.assign(res.url),
  });
  const [voucherOpen, setVoucherOpen] = useState(false);
  const sub = plan?.subscription ?? null;
  if (!plan || !plan.entitled || !sub) return null;
  // D-OFF-08 (JP 27/10) : un VOUCHER suit les règles d'un MANUEL (date de fin, aucun portail Stripe).
  const voucher = sub.source === 'VOUCHER';
  const manual = sub.source === 'MANUEL' || voucher;
  const portal = !manual && sub.status !== 'PENDING' && sub.status !== 'EXPIRED';

  let due: string | null = null;
  if (manual && sub.manualEndDate) {
    const [y, m, d] = sub.manualEndDate.slice(0, 10).split('-').map(Number);
    due = t('hierarchy.plan.manualUntil', {
      date: new Date(y, m - 1, d).toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
  } else if (sub.cancelAtPeriodEnd || sub.status === 'CANCELED') due = t('hierarchy.plan.endsOn', { date: fmtDay(sub.currentPeriodEnd, lang) });
  else if (sub.status === 'PAST_DUE' && sub.graceEndsAt) due = t('hierarchy.plan.grace', { date: fmtDay(sub.graceEndsAt, lang) });
  else if (sub.currentPeriodEnd) due = t('hierarchy.plan.renewsOn', { date: fmtDay(sub.currentPeriodEnd, lang) });

  return (
    <div className="card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Icon name="check" size={15} style={{ color: 'var(--ok)' }} />
      <strong style={{ fontSize: 13.5 }}>{plan.offerName}</strong>
      {/* D-MKT-03 (JP 28/10, RG-MKT-30) : formule de l'abonnement (mensuelle ou annuelle). */}
      {sub.billingPeriod && <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>{t(`cityStudy.lock.periods.${sub.billingPeriod}`)}</span>}
      <Badge tone={sub.status === 'PAST_DUE' ? 'err' : sub.status === 'ACTIVE' ? 'ok' : 'gray'} dot>{t(`billing.status.${sub.status}`)}</Badge>
      {due && <span style={{ fontSize: 13, color: sub.status === 'PAST_DUE' ? 'var(--err)' : 'var(--ink-600)' }}>{due}</span>}
      {portalM.isError && <span style={{ color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(portalM.error, t)}</span>}
      {portal && (
        <Button size="sm" variant={sub.status === 'PAST_DUE' ? 'primary' : 'secondary'} disabled={portalM.isPending} onClick={() => portalM.mutate(sub.reference)} style={{ marginLeft: 'auto' }}>
          {sub.status === 'PAST_DUE' ? t('cityStudy.lock.updateCard') : t('hierarchy.plan.manage')}
        </Button>
      )}
      {/* §3.6 : un nouveau code PROLONGE un abonnement VOUCHER de sa durée (décidé par le serveur). */}
      {voucher && (
        <>
          <Button size="sm" variant="secondary" iconL={<Icon name="tag" size={13} />} onClick={() => setVoucherOpen(true)} style={{ marginLeft: 'auto' }}>
            {t('offers.voucher.extend')}
          </Button>
          <VoucherRedeemModal open={voucherOpen} onClose={() => setVoucherOpen(false)} plan="caleb" localPriceLabel={plan.localPriceLabel} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
//  Verrou COMPACT de l'offre Caleb (« le suivi de ma hiérarchie », `HIERARCHIE_SUIVI`) — plan 05,
//  D-OFF-02 / D-OFF-04 / D-OFF-06 (JP 27/10). Affiché À LA PLACE du contenu d'une assemblée qui n'est
//  pas l'assemblée gratuite du compte (CR, journal, réunions, avancement — pages/Assembly.tsx) ou des
//  fiches Member Care d'une assemblée de la chaîne (pages/MemberCare.tsx), sur un 403
//  `MODULE_ACCESS_DENIED` `HIERARCHIE_SUIVI` ou d'avance (assemblée dirigée absente de `GET /units`).
//  Jamais un toast. Axe de la CHAÎNE de supervision, jamais la géographie (offre Néhémie).
//  Pas de caisse ici : un lien vers la Hiérarchie, où vit le verrou complet (`HierarchyLockedFeature`).
//  `canSubscribe` : celui du 403 quand on l'a (le plus frais), à défaut celui du plan personnel
//  (`GET /entitlements/personal`, calculé par le serveur) ; sinon « Demandez l'activation à l'équipe
//  Shephr. » (P-06). Revue web (JP 27/10) : un compte qui a DÉJÀ `HIERARCHIE_SUIVI` n'est jamais invité
//  à prendre Caleb — sans 403, l'assemblée est hors de sa chaîne (message dédié, ou rien avec
//  `hideWhenEntitled`) ; avec un 403 `HIERARCHIE_SUIVI`, le droit lu en cache est périmé et relu.
// ---------------------------------------------------------------------------------------------

/** Assemblée proposée avec un cadenas dans un sélecteur (forme de `MeResponse.assemblies`). */
export type CalebLockedAssembly = NonNullable<MeResponse['assemblies']>[number];

/**
 * D-OFF-02 / D-OFF-06 (JP 27/10) — verrou Caleb « d'avance » : assemblées que le compte DIRIGE
 * (`ledAssemblyIds`, `DIRIGEANT_UNITE` seulement — jamais un simple rattachement de `me.assemblies`)
 * mais que la liste du serveur (`unitIds` : `GET /assembly/units` ou `/member-care/units`) ne renvoie
 * pas. Vide pour le superAdmin, un compte sans accès ministère, tant que la liste ou le droit personnel
 * ne sont pas lus, et pour un compte qui a déjà `HIERARCHIE_SUIVI` (Caleb lui ouvre sa chaîne : une
 * assemblée encore absente n'est pas une affaire d'abonnement). Le serveur reste seul juge (403).
 */
export function useCalebLockedAssemblies(unitIds: string[] | undefined): CalebLockedAssembly[] {
  const { me } = useAuth();
  const eligible = !!me && !me.superAdmin && hasMinistryAccess(me);
  const personalQ = useQuery({
    queryKey: ['entitlements', 'personal'],
    queryFn: getPersonalEntitlements,
    retry: false,
    enabled: eligible,
  });
  const entitled = personalQ.data?.codes.includes(ENTITLEMENT_HIERARCHIE_SUIVI) ?? false;
  return useMemo(() => {
    if (!eligible || !unitIds || personalQ.isLoading || entitled) return [];
    const led = ledAssemblyIds(me);
    const listed = new Set(unitIds);
    return (me?.assemblies ?? []).filter((a) => led.has(a.id) && !listed.has(a.id));
  }, [eligible, unitIds, personalQ.isLoading, entitled, me]);
}

export function HierarchyLockedCompact({
  context,
  canSubscribe,
  hideWhenEntitled = false,
}: {
  /** Ce qui est verrouillé : une assemblée (CR, journal, avancement) ou des fiches de suivi pastoral. */
  context: 'assembly' | 'memberCare';
  /**
   * `details.canSubscribe` du 403 `HIERARCHIE_SUIVI` quand on l'a (il prime : c'est la réponse la plus
   * fraîche) ; `undefined` = affichage d'avance, sans 403 — le plan personnel décide alors.
   */
  canSubscribe?: boolean;
  /**
   * Affichage d'avance (aucun 403 reçu) : rien si le code `HIERARCHIE_SUIVI` est déjà ouvert pour le
   * compte (sans cette option : message « hors de votre chaîne ») ; rien non plus pendant le chargement.
   */
  hideWhenEntitled?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const personalQ = useQuery({
    queryKey: ['entitlements', 'personal'],
    queryFn: getPersonalEntitlements,
    retry: false,
  });
  const plan = personalQ.data?.plans.find((p) => p.planCode === PLAN_DIRIGEANT_HIERARCHIE) ?? null;
  const entitled = personalQ.data?.codes.includes(ENTITLEMENT_HIERARCHIE_SUIVI) ?? false;
  /** Rendu sur un 403 `HIERARCHIE_SUIVI` : le serveur vient de dire que le droit manque. */
  const denied = canSubscribe !== undefined;
  // 403 alors que le cache dit « droit ouvert » : droit expiré entre-temps — relire le plan personnel.
  useEffect(() => {
    if (denied && entitled) void qc.invalidateQueries({ queryKey: ['entitlements', 'personal'] });
  }, [denied, entitled, qc]);
  const subscribable = canSubscribe ?? plan?.canSubscribe ?? false;
  if (personalQ.isLoading) return null;
  if (entitled && !denied) {
    if (hideWhenEntitled) return null;
    // Caleb déjà ouvert : jamais d'invitation — l'assemblée est hors de la chaîne de supervision.
    return (
      <div className="card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--parchment)', display: 'grid', placeItems: 'center', color: 'var(--earth-700)', flexShrink: 0 }}>
          <Icon name="lock" size={17} />
        </div>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontWeight: 600, color: 'var(--green-800)', marginBottom: 4 }}>{t('hierarchy.lock.outsideChainTitle')}</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.5 }}>
            {t(context === 'memberCare' ? 'hierarchy.lock.outsideChainMemberCare' : 'hierarchy.lock.outsideChainAssembly')}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--parchment)', display: 'grid', placeItems: 'center', color: 'var(--earth-700)', flexShrink: 0 }}>
        <Icon name="lock" size={17} />
      </div>
      <div style={{ flex: '1 1 240px' }}>
        <div style={{ fontWeight: 600, color: 'var(--green-800)', marginBottom: 4 }}>{t('hierarchy.lock.compactTitle')}</div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-600)', lineHeight: 1.5 }}>
          {t(context === 'memberCare' ? 'hierarchy.lock.compactMemberCare' : 'hierarchy.lock.compactAssembly')}
        </div>
        {!subscribable && (
          <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 6 }}>{t('hierarchy.lock.askShephr')}</div>
        )}
      </div>
      {subscribable && (
        // D-HIE-01 (JP 28/10) : le verrou complet vit en page 3 « Vie de mon leadership ».
        <Link to="/hierarchy/vie" className="btn secondary sm" style={{ alignSelf: 'center' }}>
          {t('hierarchy.lock.openHierarchy')}
        </Link>
      )}
    </div>
  );
}
