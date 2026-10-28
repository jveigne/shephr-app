import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Picker } from '../components/ui';
import { Icon } from '../components/Icon';
import { LocalPriceLine, VoucherRedeemModal, type VoucherCity } from '../components/VoucherRedeemModal';
import { useAuth } from '../hooks/useAuth';
import { hasMemberSpace, hasMinistryAccess } from '../services/authApi';
import {
  checkout,
  getPublicPlans,
  listMySubscriptions,
  type BillingPeriod,
  type PublicPlan,
} from '../services/billingApi';
import {
  ENTITLEMENT_HIERARCHIE_SUIVI,
  PLAN_DIRIGEANT_HIERARCHIE,
  getPersonalEntitlements,
} from '../services/entitlementsApi';
import { listStudyLocalities } from '../services/assemblyApi';
import { useContactSettings } from '../services/contactApi';
import { useHandoffExchange } from '../utils/handoff';
import { mobileMoneyMessage, mobileMoneyUrl } from '../utils/mobileMoney';
import { BillingLayout, PageTitle, billingErrMsg, cardStyle, fmtCents } from './Billing';

// ---------------------------------------------------------------------------------------------
//  /offres — présentation des offres Caleb et Néhémie (plan 05_Plan_Offres_Caleb_Nehemie.md §3.8,
//  ticket O10, JP 27/10) puis PAIEMENT sous chaque offre (lot « PAY », plan 28_10_2026/03, JP 28/10).
//  Page PUBLIQUE, hors shell : elle remplace /abonnements (redirection, P-11 / O12) et reçoit le lien
//  « En savoir plus » des verrous du mobile (D-OFF-11, `?offer=caleb|nehemie` : la page défile jusqu'à
//  la carte). Entrée de menu `nav.offers` dans l'AppShell SEULEMENT.
//  - D-PAY-01 : la page PRÉSENTE D'ABORD les offres (verset, pour qui, inclus, prix serveur, prix local
//    Mobile Money), connecté ou non ; les actions de paiement viennent sous chaque offre.
//  - Deux offres INDÉPENDANTES, deux axes à ne jamais confondre :
//    · Caleb (`DIRIGEANT_HIERARCHIE` / `HIERARCHIE_SUIVI`) = CHAÎNE de supervision, droit personnel,
//      mensuel seul, caisse SANS ville ;
//    · Néhémie (`EGLISE_VILLE`) = GÉOGRAPHIE, droit de la ville, caisse AVEC ville + période.
//  - Prix = centimes de `GET /api/public/billing/plans` (jeton ignoré), jamais recalculés (RG-ABO-05) ;
//    `localPriceLabel` = prix Mobile Money en texte libre (D-OFF-08), information seulement.
//  - D-PAY-04 / RG-PAY-30 : déconnecté → « Se connecter pour payer » (`/login?next=/offres?offer=…`,
//    Google / Apple sur /login — D-PAY-06) ; aucun bouton carte, Mobile Money ni code.
//  - D-PAY-02 / 07 (RG-PAY-25, 32 à 34) : connecté et `canSubscribe` (serveur) → « Payer par carte »
//    (caisse `origin: 'OFFERS'`, annulation Stripe ramenée ici avec `&annule=1`, RG-PAY-36), « Payer par
//    Mobile Money » (WhatsApp du relais, masqué sans numéro — D-PAY-03) et « J'ai un code ». Néhémie :
//    ville + période choisies ici (plus de détour par /study/city) ; ville déjà ouverte → « Déjà actif ».
//    Sans droit de souscrire → texte neutre `offers.{caleb|nehemie}.reserved`, ni carte ni Mobile Money.
//  - D-PAY-05 : le fragment `#handoff=` (jeton de passage de l'app) est effacé puis échangé contre une
//    session web (`utils/handoff.ts`) ; bandeau « Connecté en tant que … — Ce n'est pas vous ? ».
//  - Un simple membre connecté ne voit aucun prix (§3.8 du plan 05, inchangé).
//  Libellés « Offre Caleb » / « Offre Néhémie » et versets (Louis Segond 1910) : i18n `offers.*`.
// ---------------------------------------------------------------------------------------------

type OfferKind = 'caleb' | 'nehemie';

const PLAN_OF: Record<OfferKind, string> = {
  caleb: PLAN_DIRIGEANT_HIERARCHIE,
  nehemie: 'EGLISE_VILLE',
};

const INCLUDED: Record<OfferKind, string[]> = {
  caleb: ['reports', 'stats', 'journal', 'study', 'memberCare'],
  nehemie: ['study', 'journal', 'events', 'shared'],
};

const FREE_ITEMS = ['study', 'assembly', 'memberCare', 'goals', 'hierarchy', 'events', 'documents', 'praise'];

export function OffersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const target = params.get('offer');
  const canceled = params.get('annule') === '1';
  // D-PAY-05 (RG-PAY-13) : appelé en tête — efface `#handoff=` et l'échange une seule fois.
  const handedOff = useHandoffExchange();
  const { ready, isAuthenticated, me, logout } = useAuth();
  const loggedIn = ready && isAuthenticated;
  // §3.8 : un compte dirigeant (ou superAdmin) voit prix et boutons ; un simple membre ne voit aucun
  // prix. Le visiteur déconnecté voit les prix publics.
  const leader = loggedIn && hasMinistryAccess(me);
  const showPrices = ready && (!loggedIn || leader);

  const plansQ = useQuery({ queryKey: ['billing', 'public-plans'], queryFn: getPublicPlans, retry: false });
  const subsQ = useQuery({ queryKey: ['billing', 'subscriptions'], queryFn: listMySubscriptions, enabled: loggedIn, retry: false });
  const planOf = (kind: OfferKind) => (plansQ.data ?? []).find((p) => p.planCode === PLAN_OF[kind]);

  // Défilement vers la carte demandée (`?offer=`), une fois la mise en page stabilisée — y compris
  // après le retour de /login ou l'échange du jeton de passage (RG-PAY-31).
  useEffect(() => {
    if (target !== 'caleb' && target !== 'nehemie') return;
    if (plansQ.isLoading || !ready) return;
    const id = window.setTimeout(() => {
      document.getElementById(`offer-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(id);
  }, [target, plansQ.isLoading, ready, loggedIn]);

  const home = hasMinistryAccess(me) ? '/dashboard' : hasMemberSpace(me) ? '/my-goals' : '/join';
  const who = me?.username ?? me?.email ?? me?.fullName ?? '';

  return (
    <BillingLayout>
      <PageTitle title={t('offers.title')} sub={t('offers.subtitle')} />

      {/* RG-PAY-14 : après un jeton de passage, dire qui est connecté et permettre d'en sortir. */}
      {handedOff && loggedIn && (
        <div role="status" style={{ background: 'var(--green-50)', color: 'var(--green-800)', border: '1px solid var(--green-100)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 14, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="user" size={16} />
          <span style={{ flex: 1, minWidth: 180 }}>{t('offers.handoff.connectedAs', { username: who })}</span>
          <button
            type="button"
            onClick={() => void logout()}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--green-700)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-sans)' }}
          >
            {t('offers.handoff.notYou')}
          </button>
        </div>
      )}

      {/* RG-PAY-36 : annulation de la caisse Stripe ouverte d'ici (`origin: 'OFFERS'`). */}
      {canceled && (
        <div role="status" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 14, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="info" size={16} />
          <span style={{ flex: 1 }}>{t('offers.pay.cancelled')}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('common.close')}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('annule');
              setParams(next, { replace: true });
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {loggedIn && (
        <p style={{ margin: '-8px 0 22px', fontSize: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link to={home} style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.mine.backToSpace')}</Link>
          {(subsQ.data ?? []).length > 0 && (
            <Link to="/abonnements/mes-abonnements" style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.menu')}</Link>
          )}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20, alignItems: 'stretch' }}>
        {(['caleb', 'nehemie'] as const).map((kind) => (
          <OfferCard key={kind} kind={kind} plan={planOf(kind)} plansLoading={plansQ.isLoading} highlighted={target === kind} showPrices={showPrices}>
            {!ready ? null : !loggedIn ? (
              <LoginActions kind={kind} />
            ) : !leader ? (
              // D-PAY-07 : sans droit de souscrire, explication neutre — ni carte ni Mobile Money.
              <ReservedText kind={kind} />
            ) : kind === 'caleb' ? (
              <CalebActions publicPlan={planOf('caleb')} username={who} />
            ) : (
              <NehemieActions publicPlan={planOf('nehemie')} username={who} />
            )}
          </OfferCard>
        ))}
      </div>

      <p style={{ margin: '18px 0 0', color: 'var(--ink-600)', fontSize: 13.5, lineHeight: 1.6, textAlign: 'center' }}>
        {t('offers.independent')}
      </p>

      <FreeBlock />

      {showPrices && (
        <>
          <p style={{ marginTop: 22, fontSize: 13, color: 'var(--ink-500)', textAlign: 'center', lineHeight: 1.6 }}>{t('offers.howToPay')}</p>
          <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink-400)', textAlign: 'center' }}>{t('billing.offers.stripeNote')}</p>
        </>
      )}
    </BillingLayout>
  );
}

function OfferCard({
  kind,
  plan,
  plansLoading,
  highlighted,
  showPrices,
  children,
}: {
  kind: OfferKind;
  plan: PublicPlan | undefined;
  plansLoading: boolean;
  highlighted: boolean;
  showPrices: boolean;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <section
      id={`offer-${kind}`}
      aria-labelledby={`offer-${kind}-title`}
      style={{
        ...cardStyle,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        scrollMarginTop: 80,
        border: highlighted ? '2px solid var(--green-600)' : cardStyle.border,
      }}
    >
      <div>
        <h2 id={`offer-${kind}-title`} style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 24, color: 'var(--green-800)', margin: 0 }}>
          {t(`offers.${kind}.name`)}
        </h2>
        <div style={{ color: 'var(--earth-700)', fontSize: 14.5, fontWeight: 600, marginTop: 2 }}>{t(`offers.${kind}.tagline`)}</div>
      </div>

      <figure style={{ margin: 0, padding: '12px 14px', background: 'var(--parchment)', borderLeft: '3px solid var(--green-600)', borderRadius: 'var(--radius)' }}>
        <blockquote style={{ margin: 0, fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--green-900)', lineHeight: 1.4 }}>
          {t(`offers.${kind}.verse`)}
        </blockquote>
        <figcaption style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink-500)' }}>
          {t(`offers.${kind}.verseRef`)} · {t('offers.bibleVersion')}
        </figcaption>
      </figure>

      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-500)' }}>{t('offers.forWhoTitle')}</h3>
        <p style={{ margin: 0, color: 'var(--ink-700)', fontSize: 14, lineHeight: 1.55 }}>{t(`offers.${kind}.forWho`)}</p>
      </div>

      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-500)' }}>{t('offers.includedTitle')}</h3>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {INCLUDED[kind].map((k) => (
            <li key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.5 }}>
              <Icon name="check" size={14} style={{ color: 'var(--green-600)', flexShrink: 0, marginTop: 3 }} />
              <span>{t(`offers.${kind}.included.${k}`)}</span>
            </li>
          ))}
        </ul>
      </div>

      {showPrices && (
        <div>
          {plansLoading ? (
            <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>{t('common.loading')}</span>
          ) : plan ? (
            <>
              {/* RG-ABO-05 : centimes du serveur, formatés selon la langue, jamais recalculés. */}
              <div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--green-700)' }}>
                  {fmtCents(plan.monthlyPriceCents, plan.currency, lang)}
                </span>
                <span style={{ color: 'var(--ink-500)', fontSize: 13, marginLeft: 6 }}>{t('billing.period.MONTHLY')}</span>
                {plan.annualPriceCents != null && plan.annualPriceCents > 0 && (
                  <span style={{ color: 'var(--ink-600)', fontSize: 14, marginLeft: 8 }}>
                    {t('offers.orAnnual', { price: fmtCents(plan.annualPriceCents, plan.currency, lang) })}
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--ink-500)', fontSize: 12.5 }}>{t(kind === 'caleb' ? 'offers.caleb.priceNote' : 'offers.nehemie.priceNote')}</div>
              <LocalPriceLine label={plan.localPriceLabel} style={{ marginTop: 4 }} />
            </>
          ) : (
            <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>{t('offers.priceUnavailable')}</span>
          )}
        </div>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </section>
  );
}

/** Titre du bloc de paiement, sous la présentation de l'offre (D-PAY-01). */
function PayTitle() {
  const { t } = useTranslation();
  return (
    <h3 style={{ margin: '4px 0 0', paddingTop: 12, borderTop: '1px solid var(--line-soft)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-500)' }}>
      {t('offers.pay.title')}
    </h3>
  );
}

function ReservedText({ kind }: { kind: OfferKind }) {
  const { t } = useTranslation();
  return <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 13.5, lineHeight: 1.5 }}>{t(`offers.${kind}.reserved`)}</p>;
}

/** RG-PAY-30 : déconnecté — se connecter d'abord (D-PAY-04 : pas de paiement anonyme). */
function LoginActions({ kind }: { kind: OfferKind }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const next = `/login?next=${encodeURIComponent(`/offres?offer=${kind}`)}`;
  return (
    <>
      <PayTitle />
      <Button variant="primary" style={{ justifyContent: 'center' }} onClick={() => navigate(next)}>
        {t('offers.pay.loginToPay')}
      </Button>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)', textAlign: 'center' }}>
        {t('offers.noAccount')}{' '}
        <Link to="/signup" style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.offers.signup')}</Link>
      </p>
    </>
  );
}

/**
 * « Payer par Mobile Money » (D-PAY-02 / 03, RG-PAY-22 à 25) : lien WhatsApp vers le relais, masqué tant
 * que le numéro n'est pas réglé au back-office. Affiché seulement par un appelant `canSubscribe`.
 */
function MobileMoneyButton({ message }: { message: string }) {
  const { t } = useTranslation();
  const { paymentWhatsappUrl } = useContactSettings();
  if (!paymentWhatsappUrl) return null;
  return (
    <>
      <a
        className="btn secondary"
        href={mobileMoneyUrl(paymentWhatsappUrl, message)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ justifyContent: 'center', textDecoration: 'none' }}
      >
        {t('offers.pay.mobileMoney')}
      </a>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.5 }}>{t('offers.pay.mobileMoneyHint')}</p>
    </>
  );
}

/** Caleb — droit PERSONNEL (chaîne de supervision) : `GET /entitlements/personal` dit tout. */
function CalebActions({ publicPlan, username }: { publicPlan: PublicPlan | undefined; username: string }) {
  const { t, i18n } = useTranslation();
  const [voucherOpen, setVoucherOpen] = useState(false);
  const personalQ = useQuery({ queryKey: ['entitlements', 'personal'], queryFn: getPersonalEntitlements, retry: false });
  // Mensuel seulement, jamais de `localityId` (400 `PERSONAL_PLAN_LOCALITY_FORBIDDEN`) ; RG-PAY-32 :
  // `origin: 'OFFERS'` — l'annulation Stripe revient sur /offres?offer=caleb&annule=1.
  const checkoutM = useMutation({
    mutationFn: (offerCode: string) => checkout(offerCode, null, { period: 'MONTHLY', origin: 'OFFERS' }),
    onSuccess: (res) => window.location.assign(res.url),
  });

  if (personalQ.isLoading) return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13.5 }}>{t('common.loading')}</p>;
  const personal = personalQ.data;
  const plan = personal?.plans.find((p) => p.planCode === PLAN_DIRIGEANT_HIERARCHIE) ?? null;
  const entitled = !!personal?.codes.includes(ENTITLEMENT_HIERARCHIE_SUIVI);
  const sub = plan?.subscription ?? null;
  const localPriceLabel = plan?.localPriceLabel ?? publicPlan?.localPriceLabel ?? null;
  const voucherModal = (
    <VoucherRedeemModal open={voucherOpen} onClose={() => setVoucherOpen(false)} plan="caleb" localPriceLabel={localPriceLabel} />
  );
  const voucherButton = (label: string) => (
    <Button variant="secondary" iconL={<Icon name="tag" size={14} />} style={{ justifyContent: 'center' }} onClick={() => setVoucherOpen(true)}>
      {label}
    </Button>
  );

  if (entitled) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone="ok" dot>{t('offers.caleb.active')}</Badge>
          <Link to="/hierarchy/vie" style={{ color: 'var(--green-700)', fontWeight: 600, fontSize: 13.5 }}>{t('billing.plan.backToHierarchy')}</Link>
        </div>
        {/* §3.6 : un nouveau code prolonge un abonnement VOUCHER (le serveur décide). */}
        {sub?.source === 'VOUCHER' && voucherButton(t('offers.voucher.extend'))}
        {voucherModal}
      </>
    );
  }
  if (sub?.status === 'PENDING') {
    return <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 13.5 }}>{t('hierarchy.lock.pending')}</p>;
  }
  // D-PAY-07 : sans droit de souscrire (serveur), ni carte ni Mobile Money.
  if (!plan || !plan.canSubscribe) return <ReservedText kind="caleb" />;
  const price = fmtCents(plan.monthlyPriceCents, plan.currency, i18n.language);
  return (
    <>
      <PayTitle />
      <Button variant="primary" style={{ justifyContent: 'center' }} disabled={checkoutM.isPending} onClick={() => checkoutM.mutate(plan.offerCode)}>
        {checkoutM.isPending ? t('billing.offers.redirecting') : t('offers.pay.cardMonthly', { price })}
      </Button>
      {checkoutM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(checkoutM.error, t)}</p>}
      <MobileMoneyButton message={mobileMoneyMessage(t, { offer: 'caleb', localPrice: localPriceLabel, username })} />
      {voucherButton(t('offers.voucher.open'))}
      {voucherModal}
    </>
  );
}

/**
 * Néhémie — droit de VILLE (géographie) : `GET /study/localities` dit quelles villes et `canSubscribe`.
 * D-PAY-07 (RG-PAY-33 / 34) : ville + période choisies ici, puis caisse directe ; un abonnement = une
 * ville (D-PAY-09) — un coordinateur à plusieurs villes paie ville par ville.
 */
function NehemieActions({ publicPlan, username }: { publicPlan: PublicPlan | undefined; username: string }) {
  const { t, i18n } = useTranslation();
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [cityId, setCityId] = useState('');
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  // Même clé que la Sidebar : une seule lecture de `/study/localities` (vide pour un membre / un
  // dirigeant d'unité, RG-ABO-22).
  const citiesQ = useQuery({ queryKey: ['assembly', 'study', 'localities'], queryFn: listStudyLocalities, retry: false });
  const cities = citiesQ.data ?? [];
  const eligible = cities.filter((c) => c.canSubscribe);
  const open = eligible.filter((c) => !c.entitled);

  // Présélection quand une seule ville peut être payée (RG-PAY-34).
  const onlyOpenId = open.length === 1 ? open[0].localityId : null;
  useEffect(() => {
    if (!cityId && onlyOpenId) setCityId(onlyOpenId);
  }, [cityId, onlyOpenId]);

  // RG-PAY-34 / 36 : ville + période, `origin: 'OFFERS'` (annulation → /offres?offer=nehemie&annule=1).
  const checkoutM = useMutation({
    mutationFn: (v: { offerCode: string; localityId: string; period: BillingPeriod }) =>
      checkout(v.offerCode, null, { localityId: v.localityId, period: v.period, origin: 'OFFERS' }),
    onSuccess: (res) => window.location.assign(res.url),
  });

  if (citiesQ.isLoading) return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13.5 }}>{t('common.loading')}</p>;
  const voucherCities: VoucherCity[] = eligible.map((c) => ({ localityId: c.localityId, localityName: c.localityName }));
  const entitledNames = cities.filter((c) => c.entitled).map((c) => c.localityName);
  const activeBadge = entitledNames.length > 0 && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Badge tone="ok" dot>{t('offers.nehemie.activeFor', { cities: entitledNames.join(', ') })}</Badge>
    </div>
  );

  // RG-PAY-33 : aucune ville pour laquelle souscrire → texte neutre (et badge des villes actives).
  if (eligible.length === 0) {
    return (
      <>
        {activeBadge}
        <ReservedText kind="nehemie" />
      </>
    );
  }

  const city = eligible.find((c) => c.localityId === cityId) ?? null;
  const hasAnnual = publicPlan?.annualPriceCents != null && publicPlan.annualPriceCents > 0;
  const effPeriod: BillingPeriod = hasAnnual ? period : 'MONTHLY';
  const cents = publicPlan ? (effPeriod === 'ANNUAL' ? (publicPlan.annualPriceCents as number) : publicPlan.monthlyPriceCents) : null;
  const price = publicPlan && cents != null ? fmtCents(cents, publicPlan.currency, i18n.language) : null;

  return (
    <>
      {activeBadge}
      <PayTitle />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>{t('offers.nehemie.city')}</div>
        <Picker
          value={cityId}
          onChange={(id) => {
            setCityId(id);
            checkoutM.reset();
          }}
          placeholder={t('offers.voucher.cityPlaceholder')}
          // Ville déjà ouverte : listée avec « Déjà actif » (le Picker n'a pas d'option désactivée ;
          // la choisir n'offre aucun bouton de paiement).
          options={eligible.map((c) => ({
            id: c.localityId,
            label: c.localityName,
            meta: c.entitled ? t('offers.nehemie.alreadyActive') : undefined,
          }))}
        />
      </div>
      {hasAnnual && (
        <div role="radiogroup" aria-label={t('offers.nehemie.period')} style={{ display: 'flex', gap: 6 }}>
          {(['MONTHLY', 'ANNUAL'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`btn sm ${period === p ? 'primary' : 'secondary'}`}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {t(p === 'ANNUAL' ? 'offers.nehemie.annual' : 'offers.nehemie.monthly')}
            </button>
          ))}
        </div>
      )}
      {city?.entitled ? (
        <div>
          <Badge tone="ok" dot>{t('offers.nehemie.alreadyActive')}</Badge>
        </div>
      ) : (
        <>
          {publicPlan && price && (
            <Button
              variant="primary"
              style={{ justifyContent: 'center' }}
              disabled={!city || checkoutM.isPending}
              onClick={() => city && checkoutM.mutate({ offerCode: publicPlan.offerCode, localityId: city.localityId, period: effPeriod })}
            >
              {checkoutM.isPending
                ? t('billing.offers.redirecting')
                : t(effPeriod === 'ANNUAL' ? 'offers.pay.cardAnnual' : 'offers.pay.cardMonthly', { price })}
            </Button>
          )}
          {checkoutM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(checkoutM.error, t)}</p>}
          {city && (
            <MobileMoneyButton
              message={mobileMoneyMessage(t, {
                offer: 'nehemie',
                localPrice: publicPlan?.localPriceLabel ?? null,
                username,
                city: city.localityName,
                period: effPeriod,
              })}
            />
          )}
        </>
      )}
      <Button variant="secondary" iconL={<Icon name="tag" size={14} />} style={{ justifyContent: 'center' }} onClick={() => setVoucherOpen(true)}>
        {t('offers.voucher.open')}
      </Button>
      <VoucherRedeemModal
        open={voucherOpen}
        onClose={() => setVoucherOpen(false)}
        plan="nehemie"
        cities={voucherCities}
        localPriceLabel={publicPlan?.localPriceLabel ?? null}
      />
    </>
  );
}

function FreeBlock() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="offers-free-title" style={{ ...cardStyle, marginTop: 28, background: 'var(--green-50)', borderColor: 'var(--green-100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 id="offers-free-title" style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22, color: 'var(--green-800)', margin: 0 }}>
          {t('offers.free.title')}
        </h2>
        <Badge tone="ok">{t('offers.free.badge')}</Badge>
      </div>
      <p style={{ margin: '0 0 14px', color: 'var(--ink-600)', fontSize: 14, lineHeight: 1.55 }}>{t('offers.free.subtitle')}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '8px 18px' }}>
        {FREE_ITEMS.map((k) => (
          <li key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.5 }}>
            <Icon name="check" size={14} style={{ color: 'var(--green-600)', flexShrink: 0, marginTop: 3 }} />
            <span>{t(`offers.free.items.${k}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
