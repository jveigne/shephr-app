import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { LocalPriceLine, VoucherRedeemModal, type VoucherCity } from '../components/VoucherRedeemModal';
import { useAuth } from '../hooks/useAuth';
import { hasMemberSpace, hasMinistryAccess } from '../services/authApi';
import { checkout, getPublicPlans, listMySubscriptions, type PublicPlan } from '../services/billingApi';
import {
  ENTITLEMENT_HIERARCHIE_SUIVI,
  PLAN_DIRIGEANT_HIERARCHIE,
  getPersonalEntitlements,
} from '../services/entitlementsApi';
import { listStudyLocalities } from '../services/assemblyApi';
import { BillingLayout, PageTitle, billingErrMsg, cardStyle, fmtCents } from './Billing';

// ---------------------------------------------------------------------------------------------
//  /offres — présentation des offres Caleb et Néhémie (plan 05_Plan_Offres_Caleb_Nehemie.md §3.8,
//  ticket O10, JP 27/10). Page PUBLIQUE, hors shell : elle remplace /abonnements (redirection, P-11 /
//  O12) et reçoit le lien « En savoir plus » des verrous du mobile (D-OFF-11, `?offer=caleb|nehemie` :
//  la page défile jusqu'à la carte). Entrée de menu `nav.offers` dans l'AppShell SEULEMENT.
//  - Deux offres INDÉPENDANTES, deux axes à ne jamais confondre :
//    · Caleb (`DIRIGEANT_HIERARCHIE` / `HIERARCHIE_SUIVI`) = CHAÎNE de supervision, droit personnel ;
//    · Néhémie (`EGLISE_VILLE`) = GÉOGRAPHIE, droit de la ville.
//  - Prix = centimes de `GET /api/public/billing/plans` (jeton ignoré), jamais recalculés (RG-ABO-05) ;
//    `localPriceLabel` = prix Mobile Money en texte libre (D-OFF-08), information seulement.
//  - Connecté (AppShell) : `canSubscribe` lu du serveur — `/entitlements/personal` (Caleb) et
//    `/study/localities` (Néhémie). Caleb « S'abonner » → caisse directe (sans ville) ; Néhémie
//    « Choisir ma ville » → `/study/city?tab=subscription` ; « J'ai un code » (modale) dans les deux.
//  - Déconnecté : « Se connecter » (`/login?next=/offres?offer=…`).
//  - Un simple membre ne voit aucun prix (§3.8) : connecté sans accès dirigeant → cartes sans prix
//    ni bouton, avec une mention « réservé aux dirigeants ».
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
  const [params] = useSearchParams();
  const target = params.get('offer');
  const { ready, isAuthenticated, me } = useAuth();
  const loggedIn = ready && isAuthenticated;
  // §3.8 : page d'AppShell — un compte dirigeant (ou superAdmin) voit prix et boutons ; un simple
  // membre ne voit aucun prix. Le visiteur déconnecté voit les prix publics.
  const leader = loggedIn && hasMinistryAccess(me);
  const showPrices = ready && (!loggedIn || leader);

  const plansQ = useQuery({ queryKey: ['billing', 'public-plans'], queryFn: getPublicPlans, retry: false });
  const subsQ = useQuery({ queryKey: ['billing', 'subscriptions'], queryFn: listMySubscriptions, enabled: loggedIn, retry: false });
  const planOf = (kind: OfferKind) => (plansQ.data ?? []).find((p) => p.planCode === PLAN_OF[kind]);

  // Défilement vers la carte demandée (`?offer=`), une fois la mise en page stabilisée.
  useEffect(() => {
    if (target !== 'caleb' && target !== 'nehemie') return;
    if (plansQ.isLoading) return;
    const id = window.setTimeout(() => {
      document.getElementById(`offer-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(id);
  }, [target, plansQ.isLoading]);

  const home = hasMinistryAccess(me) ? '/dashboard' : hasMemberSpace(me) ? '/my-goals' : '/join';

  return (
    <BillingLayout>
      <PageTitle title={t('offers.title')} sub={t('offers.subtitle')} />

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
              <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 13.5, lineHeight: 1.5 }}>{t('offers.leadersOnly')}</p>
            ) : kind === 'caleb' ? (
              <CalebActions publicPlan={planOf('caleb')} />
            ) : (
              <NehemieActions publicPlan={planOf('nehemie')} />
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

function LoginActions({ kind }: { kind: OfferKind }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const next = `/login?next=${encodeURIComponent(`/offres?offer=${kind}`)}`;
  return (
    <>
      <Button variant="primary" style={{ justifyContent: 'center' }} onClick={() => navigate(next)}>
        {t('offers.loginToSubscribe')}
      </Button>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)', textAlign: 'center' }}>
        {t('offers.noAccount')}{' '}
        <Link to="/signup" style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.offers.signup')}</Link>
      </p>
    </>
  );
}

/** Caleb — droit PERSONNEL (chaîne de supervision) : `GET /entitlements/personal` dit tout. */
function CalebActions({ publicPlan }: { publicPlan: PublicPlan | undefined }) {
  const { t, i18n } = useTranslation();
  const [voucherOpen, setVoucherOpen] = useState(false);
  const personalQ = useQuery({ queryKey: ['entitlements', 'personal'], queryFn: getPersonalEntitlements, retry: false });
  // Mensuel seulement, jamais de `localityId` (400 `PERSONAL_PLAN_LOCALITY_FORBIDDEN`).
  const checkoutM = useMutation({
    mutationFn: (offerCode: string) => checkout(offerCode, null, { period: 'MONTHLY' }),
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
  if (!plan || !plan.canSubscribe) {
    return <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 13.5, lineHeight: 1.5 }}>{t('offers.caleb.notSubscribable')}</p>;
  }
  const price = fmtCents(plan.monthlyPriceCents, plan.currency, i18n.language);
  return (
    <>
      <Button variant="primary" style={{ justifyContent: 'center' }} disabled={checkoutM.isPending} onClick={() => checkoutM.mutate(plan.offerCode)}>
        {checkoutM.isPending ? t('billing.offers.redirecting') : t('cityStudy.lock.subscribeMonthly', { price })}
      </Button>
      {checkoutM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(checkoutM.error, t)}</p>}
      {voucherButton(t('offers.voucher.open'))}
      {voucherModal}
    </>
  );
}

/** Néhémie — droit de VILLE (géographie) : `GET /study/localities` dit quelles villes et `canSubscribe`. */
function NehemieActions({ publicPlan }: { publicPlan: PublicPlan | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [voucherOpen, setVoucherOpen] = useState(false);
  // Même clé que la Sidebar : une seule lecture de `/study/localities` (vide pour un membre / un
  // dirigeant d'unité, RG-ABO-22).
  const citiesQ = useQuery({ queryKey: ['assembly', 'study', 'localities'], queryFn: listStudyLocalities, retry: false });

  if (citiesQ.isLoading) return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13.5 }}>{t('common.loading')}</p>;
  const cities = citiesQ.data ?? [];
  const subscribable: VoucherCity[] = cities
    .filter((c) => c.canSubscribe)
    .map((c) => ({ localityId: c.localityId, localityName: c.localityName }));
  const entitledNames = cities.filter((c) => c.entitled).map((c) => c.localityName);
  const cityHref =
    subscribable.length === 1
      ? `/study/city?localityId=${encodeURIComponent(subscribable[0].localityId)}&tab=subscription`
      : '/study/city?tab=subscription';

  return (
    <>
      {entitledNames.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone="ok" dot>{t('offers.nehemie.activeFor', { cities: entitledNames.join(', ') })}</Badge>
        </div>
      )}
      {subscribable.length > 0 ? (
        <>
          <Button variant="primary" style={{ justifyContent: 'center' }} onClick={() => navigate(cityHref)}>
            {t('offers.nehemie.chooseCity')}
          </Button>
          <Button variant="secondary" iconL={<Icon name="tag" size={14} />} style={{ justifyContent: 'center' }} onClick={() => setVoucherOpen(true)}>
            {t('offers.voucher.open')}
          </Button>
          <VoucherRedeemModal
            open={voucherOpen}
            onClose={() => setVoucherOpen(false)}
            plan="nehemie"
            cities={subscribable}
            localPriceLabel={publicPlan?.localPriceLabel ?? null}
          />
        </>
      ) : entitledNames.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-600)', fontSize: 13.5, lineHeight: 1.5 }}>{t('offers.nehemie.notSubscribable')}</p>
      ) : null}
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
