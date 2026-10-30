import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useIsFetching, useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Picker } from '../components/ui';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { VoucherRedeemModal, type VoucherCity } from '../components/VoucherRedeemModal';
import { useAuth } from '../hooks/useAuth';
import { hasMemberSpace, hasMinistryAccess } from '../services/authApi';
import {
  checkout,
  getPublicPlans,
  listMySubscriptions,
  openBillingPortal,
  type BillingCurrency,
  type BillingPeriod,
  type PublicPlan,
} from '../services/billingApi';
import {
  ENTITLEMENT_HIERARCHIE_SUIVI,
  PLAN_DIRIGEANT_HIERARCHIE,
  getEntitlements,
  getPersonalEntitlements,
} from '../services/entitlementsApi';
import { listStudyLocalities } from '../services/assemblyApi';
import { useContactSettings } from '../services/contactApi';
import { useHandoffExchange } from '../utils/handoff';
import { localPriceForPeriod, mobileMoneyMessage, mobileMoneyUrl } from '../utils/mobileMoney';
import { SOCIAL_SIGN_IN_CONFIGURED } from '../config/oauth';
import { billingErrMsg, fmtCents } from './Billing';
import { CurrencyToggle, EurOnlyNote } from '../components/CurrencyToggle';
import { centsFor, currenciesOf, hasAnnualPrice, priceFor, pricesOf, useCurrencyChoice } from '../utils/currency';

// ---------------------------------------------------------------------------------------------
//  /offres — présentation des offres Caleb et Néhémie (plan 05_Plan_Offres_Caleb_Nehemie.md §3.8,
//  ticket O10, JP 27/10) puis PAIEMENT sous chaque offre (lot « PAY », plan 28_10_2026/03, JP 28/10).
//  Page PUBLIQUE, hors shell : elle remplace /abonnements (redirection, P-11 / O12) et reçoit le lien
//  « En savoir plus » des verrous du mobile (D-OFF-11, `?offer=caleb|nehemie` : la page défile jusqu'à
//  la carte). Entrée de menu `nav.offers` dans l'AppShell SEULEMENT.
//  D-MKT-01 (JP 28/10, plan 28_10_2026/05 §2.1) : mise en page et textes de la MAQUETTE VALIDÉE —
//  en-tête (Comparer · Questions · Se connecter / Mon espace), accroche « Paissez le troupeau. Voyez
//  toute l'œuvre. », trois cartes Gratuit / Caleb / Néhémie avec leurs bénéfices (dont « À venir » :
//  texte seulement, aucune fonctionnalité derrière), tableau comparatif, FAQ, pied de page. Tokens de
//  `theme/styles.css`, aucune couleur en dur.
//  D-MKT-02 : le nom du programme d'étude n'apparaît NULLE PART ici (« suivi de l'enseignement »,
//  « étude biblique ») — son libellé reste inchangé ailleurs dans l'app.
//  D-MKT-03 / 04 : Caleb existe au mois ET à l'année ; pastille « Annuel : 2 mois offerts » quand le
//  serveur donne un prix annuel. Prix = centimes du serveur, jamais en dur ni recalculés (RG-ABO-05).
//  - D-PAY-01 : la page PRÉSENTE D'ABORD les offres (verset, pour qui, inclus, prix serveur, prix local
//    Mobile Money), connecté ou non ; les actions de paiement viennent sous chaque offre.
//  - Deux offres INDÉPENDANTES, deux axes à ne jamais confondre :
//    · Caleb (`DIRIGEANT_HIERARCHIE` / `HIERARCHIE_SUIVI`) = CHAÎNE de supervision, droit personnel,
//      mensuel ou annuel (D-MKT-03), caisse SANS ville ;
//    · Néhémie (`EGLISE_VILLE`) = GÉOGRAPHIE, droit de la ville, caisse AVEC ville + période.
//  - `localPriceLabel` = prix Mobile Money en texte libre (D-OFF-08), information seulement.
//  - D-PAY-04 / RG-PAY-30 : déconnecté → « Se connecter pour s'abonner » (texte de la maquette,
//    `/login?next=/offres?offer=…`, Google / Apple sur /login — D-PAY-06) ; aucun bouton carte, Mobile
//    Money ni code.
//  - D-PAY-02 / 07 (RG-PAY-25, 32 à 34) : connecté et `canSubscribe` (serveur) → « Payer par carte »
//    (caisse `origin: 'OFFERS'`, annulation Stripe ramenée ici avec `&annule=1`, RG-PAY-36), « Payer par
//    Mobile Money » (WhatsApp du relais, masqué sans numéro — D-PAY-03) et « J'ai un code ». Néhémie :
//    ville + période choisies ici (plus de détour par /study/city) ; ville déjà ouverte → « Déjà actif ».
//    Sans droit de souscrire → texte neutre `offers.{caleb|nehemie}.reserved`, ni carte ni Mobile Money.
//  - D-PAY-05 : le fragment `#handoff=` (jeton de passage de l'app) est effacé puis échangé contre une
//    session web (`utils/handoff.ts`) ; bandeau « Connecté en tant que … — Ce n'est pas vous ? ».
//  - Un simple membre connecté ne voit aucun prix (§3.8 du plan 05, inchangé).
//  - D-CUR-03 / 04 (JP 28/10, plan 28_10_2026/07) : sélecteur € / $ en tête de la section prix (défaut $
//    en anglais, € sinon, choix gardé — `utils/currency`) ; cartes, boutons et caisse dans la devise
//    choisie, à partir des lignes `prices` du serveur (aucune conversion) ; offre sans la devise → EUR
//    avec « Prix en euros uniquement ». Mobile Money et codes : FCFA, inchangés (D-CUR-08).
// ---------------------------------------------------------------------------------------------

type OfferKind = 'caleb' | 'nehemie';

const PLAN_OF: Record<OfferKind, string> = {
  caleb: PLAN_DIRIGEANT_HIERARCHIE,
  nehemie: 'EGLISE_VILLE',
};

/** Bénéfice d'une carte : clé i18n `offers.{carte}.features.{key}.{title,desc}` ; `soon` = « À venir ». */
type Feature = { key: string; soon?: boolean };

// D-MKT-01 : listes de la maquette, dans son ordre. Les « À venir » ne sont que du texte (aucune
// fonctionnalité codée derrière).
const FREE_FEATURES: Feature[] = ['study', 'assembly', 'memberCare', 'goals', 'events', 'documents'].map((key) => ({ key }));
const CALEB_FEATURES: Feature[] = [
  { key: 'dashboard' },
  { key: 'alerts' },
  { key: 'teaching' },
  { key: 'evangelism' },
  { key: 'memberCare' },
  { key: 'pdf' },
  { key: 'monthlyEmail', soon: true },
  { key: 'trends', soon: true },
  { key: 'announcements', soon: true },
  { key: 'documents', soon: true },
];
const NEHEMIE_FEATURES: Feature[] = [
  { key: 'cityStats' },
  { key: 'teaching' },
  { key: 'evangelism' },
  { key: 'journal' },
  { key: 'exports' },
  { key: 'shared' },
  { key: 'storage', soon: true },
  { key: 'monthlyEmail', soon: true },
  { key: 'trends', soon: true },
  { key: 'announcements', soon: true },
  { key: 'coordinatorPack', soon: true },
];

/** Cellule du tableau comparatif : texte (`offers.compare.rows.{row}.{col}`), « — » ou « À venir ». */
type Cell = 'text' | 'dash' | 'soon';
const COMPARE_ROWS: { key: string; free: Cell; caleb: Cell; nehemie: Cell }[] = [
  { key: 'assembly', free: 'text', caleb: 'text', nehemie: 'text' },
  { key: 'basics', free: 'text', caleb: 'text', nehemie: 'text' },
  { key: 'stats', free: 'dash', caleb: 'text', nehemie: 'text' },
  { key: 'reports', free: 'dash', caleb: 'text', nehemie: 'text' },
  { key: 'memberCare', free: 'dash', caleb: 'text', nehemie: 'dash' },
  { key: 'evangelism', free: 'text', caleb: 'text', nehemie: 'text' },
  { key: 'exports', free: 'dash', caleb: 'text', nehemie: 'text' },
  { key: 'shared', free: 'dash', caleb: 'text', nehemie: 'text' },
  { key: 'storage', free: 'dash', caleb: 'soon', nehemie: 'soon' },
  { key: 'monthly', free: 'dash', caleb: 'soon', nehemie: 'soon' },
];

const FAQ_ITEMS = ['which', 'mobileMoney', 'commitment', 'period', 'app', 'study'];

/** Largeur commune des sections (maquette : 1200 px, gouttière 16 px au téléphone). */
const GUTTER = 'clamp(16px, 3vw, 24px)';

/** Défilement doux vers une ancre de la page sans toucher au fragment (`#handoff=` est lu au montage). */
function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function OffersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const target = params.get('offer');
  const canceled = params.get('annule') === '1';
  // D-PAY-05 (RG-PAY-13) : appelé en tête — efface `#handoff=` et l'échange une seule fois.
  const { exchanged: handedOff, settled: handoffSettled } = useHandoffExchange();
  const { ready, isAuthenticated, me, logout } = useAuth();
  const loggedIn = ready && isAuthenticated;
  // §3.8 : un compte dirigeant (ou superAdmin) voit prix et boutons ; un simple membre ne voit aucun
  // prix. Le visiteur déconnecté voit les prix publics.
  const leader = loggedIn && hasMinistryAccess(me);
  const showPrices = ready && (!loggedIn || leader);

  const plansQ = useQuery({ queryKey: ['billing', 'public-plans'], queryFn: getPublicPlans, retry: false });
  const subsQ = useQuery({ queryKey: ['billing', 'subscriptions'], queryFn: listMySubscriptions, enabled: loggedIn, retry: false });
  const planOf = (kind: OfferKind) => (plansQ.data ?? []).find((p) => p.planCode === PLAN_OF[kind]);

  // Bug JP 29/10 (« Offres » s'ouvrait en bas) : sans `?offer=`, le haut de page (`ScrollToTop` du
  // routeur, à chaque arrivée par lien) ; avec `?offer=caleb|nehemie` (dont « En savoir plus » du mobile,
  // avec ou sans `#handoff=`), le HAUT DE LA CARTE (son en-tête, pas le bloc « Payer »), UNE SEULE FOIS,
  // quand plus rien ne décale la page au-dessus d'elle : plans lus, session restaurée, jeton de passage
  // traité (bandeau « Connecté en tant que »), et — compte dirigeant — droits et villes lus (au
  // téléphone, la carte Caleb grandit au-dessus de la carte Néhémie) (RG-PAY-31).
  const scrolledRef = useRef<string | null>(null);
  const personalLoading = useQuery({ queryKey: ['entitlements', 'personal'], queryFn: getPersonalEntitlements, retry: false, enabled: leader }).isLoading;
  const citiesLoading = useQuery({ queryKey: ['assembly', 'study', 'localities'], queryFn: listStudyLocalities, retry: false, enabled: leader }).isLoading;
  const contactFetching = useIsFetching({ queryKey: ['app', 'contact'] }) > 0;
  const layoutSettled =
    ready && handoffSettled && !plansQ.isLoading && !(leader && (personalLoading || citiesLoading || contactFetching));
  useEffect(() => {
    if (target !== 'caleb' && target !== 'nehemie') return;
    if (!layoutSettled || scrolledRef.current === target) return;
    const id = window.setTimeout(() => {
      scrolledRef.current = target;
      document.getElementById(`offer-${target}`)?.scrollIntoView({ block: 'start' });
    }, 50);
    return () => window.clearTimeout(id);
  }, [target, layoutSettled]);

  const home = hasMinistryAccess(me) ? '/dashboard' : hasMemberSpace(me) ? '/my-goals' : '/join';
  const who = me?.username ?? me?.email ?? me?.fullName ?? '';

  const actionsFor = (kind: OfferKind, dark: boolean): ReactNode =>
    !ready ? null : !loggedIn ? (
      <LoginActions kind={kind} dark={dark} />
    ) : (
      // Sur la carte sombre (Néhémie), les actions connectées gardent leurs composants : elles
      // vivent dans un panneau clair (lisibilité des Picker / Badge / textes d'état).
      <div style={dark ? darkActionsPanel : { display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!leader ? (
          // D-PAY-07 : sans droit de souscrire, explication neutre — ni carte ni Mobile Money.
          <ReservedText kind={kind} />
        ) : kind === 'caleb' ? (
          <CalebActions publicPlan={planOf('caleb')} username={who} />
        ) : (
          <NehemieActions publicPlan={planOf('nehemie')} username={who} />
        )}
      </div>
    );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ivory)', color: 'var(--ink-900)', fontFamily: 'var(--font-sans)' }}>
      <OfferHeader loggedIn={loggedIn} home={home} />

      <main>
        {(handedOff && loggedIn) || canceled || loggedIn ? (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: `8px ${GUTTER} 0` }}>
            {/* RG-PAY-14 : après un jeton de passage, dire qui est connecté et permettre d'en sortir. */}
            {handedOff && loggedIn && (
              <div role="status" style={{ background: 'var(--green-50)', color: 'var(--green-800)', border: '1px solid var(--green-100)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 14, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
              <div role="status" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 14, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
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
              <p style={{ margin: '4px 0 0', fontSize: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Link to={home} style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.mine.backToSpace')}</Link>
                {(subsQ.data ?? []).length > 0 && (
                  <Link to="/abonnements/mes-abonnements" style={{ color: 'var(--green-700)', fontWeight: 600 }}>{t('billing.menu')}</Link>
                )}
              </p>
            )}
          </div>
        ) : null}

        {/* Accroche (RG-MKT-01). */}
        <section style={{ maxWidth: 860, margin: '0 auto', padding: `clamp(32px, 6vw, 48px) ${GUTTER} 40px`, textAlign: 'center' }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--earth-700)', fontWeight: 600 }}>
            {t('offers.hero.eyebrow')}
          </p>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px, 7vw, 52px)', lineHeight: 1.08, fontWeight: 600, color: 'var(--green-900)' }}>
            {t('offers.hero.title')}
          </h1>
          <p style={{ margin: '20px auto 0', maxWidth: 640, fontSize: 'clamp(16px, 2.4vw, 18px)', lineHeight: 1.6, color: 'var(--ink-700)' }}>
            {t('offers.hero.lead')}
          </p>
        </section>

        {/* D-CUR-03 (JP 28/10, RG-CUR-19) : UN sélecteur € / $ pour toute la section prix ; masqué
            si les offres n'ont qu'une devise ou si aucun prix n'est montré. */}
        {showPrices && !plansQ.isLoading && (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${GUTTER} 20px` }}>
            <CurrencyToggle available={currenciesOf(planOf('caleb'), planOf('nehemie'))} align="center" />
          </div>
        )}

        {/* Trois cartes (RG-MKT-03 / 04) — une colonne au téléphone. */}
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${GUTTER} 56px`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 24, alignItems: 'start' }}>
          <FreeCard loggedIn={loggedIn} home={home} />
          {(['caleb', 'nehemie'] as const).map((kind) => (
            <PlanCard
              key={kind}
              kind={kind}
              plan={planOf(kind)}
              plansLoading={plansQ.isLoading}
              highlighted={target === kind}
              showPrices={showPrices}
            >
              {actionsFor(kind, kind === 'nehemie')}
            </PlanCard>
          ))}
        </section>

        <CompareTable />
        <Faq />
      </main>

      <OffersFooter />
    </div>
  );
}

/** Panneau clair des actions connectées sur la carte sombre Néhémie. */
const darkActionsPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: 'var(--ivory-raised)',
  color: 'var(--ink-900)',
  borderRadius: 'var(--radius-lg)',
  padding: 16,
};

/** En-tête de la maquette (RG-MKT-01) : logo, Comparer, Questions, Se connecter / Mon espace, langue. */
function OfferHeader({ loggedIn, home }: { loggedIn: boolean; home: string }) {
  const { t } = useTranslation();
  const anchor = (id: string, label: string) => (
    <a
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault();
        scrollToId(id);
      }}
      style={{ color: 'var(--green-700)' }}
    >
      {label}
    </a>
  );
  return (
    <header style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto', padding: `24px ${GUTTER}` }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green-800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--parchment)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3v18M5 9c3 0 7-2 7-6M19 9c-3 0-7-2-7-6" />
          </svg>
        </div>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600, color: 'var(--green-800)' }}>Shephr</span>
      </Link>
      <nav style={{ display: 'flex', gap: 'clamp(12px, 3vw, 20px)', alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
        {anchor('comparer', t('offers.nav.compare'))}
        {anchor('faq', t('offers.nav.faq'))}
        <LangSwitch />
        <Link
          to={loggedIn ? home : `/login?next=${encodeURIComponent('/offres')}`}
          style={{ padding: '10px 16px', borderRadius: 'var(--radius)', background: 'var(--green-800)', color: 'var(--ivory)', textDecoration: 'none', fontWeight: 600 }}
        >
          {loggedIn ? t('offers.nav.mySpace') : t('offers.nav.login')}
        </Link>
      </nav>
    </header>
  );
}

const pill = (bg: string, fg: string): CSSProperties => ({
  alignSelf: 'flex-start',
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  background: bg,
  color: fg,
  fontSize: 12,
  fontWeight: 600,
});

/** Carte Gratuit (RG-MKT-03) : « 0 € · pour toujours » est un texte i18n, pas un prix serveur. */
function FreeCard({ loggedIn, home }: { loggedIn: boolean; home: string }) {
  const { t } = useTranslation();
  // R-04 (plan 07 §10.4, JP 29/10) : « 0 € » ou « $0 » selon la devise choisie (texte i18n).
  const [chosen] = useCurrencyChoice();
  const cta: CSSProperties = {
    marginTop: 6,
    padding: '14px 18px',
    borderRadius: 12,
    border: '1.5px solid var(--green-700)',
    color: 'var(--green-800)',
    textAlign: 'center',
    textDecoration: 'none',
    fontWeight: 600,
  };
  return (
    <article style={{ background: 'var(--ivory-raised)', border: '1px solid var(--parchment-deep)', borderRadius: 20, padding: 'clamp(20px, 5vw, 28px)', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={pill('var(--green-50)', 'var(--green-800)')}>{t('offers.free.audience')}</span>
        <h2 style={{ margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--green-900)' }}>{t('offers.free.name')}</h2>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-700)' }}>{t('offers.free.tagline')}</p>
      </div>
      <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 34, color: 'var(--green-900)' }}>
        {t(chosen === 'USD' ? 'offers.free.priceUsd' : 'offers.free.price')}
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--ink-500)' }}> {t('offers.free.forever')}</span>
      </p>
      <FeatureList prefix="offers.free.features" items={FREE_FEATURES} dark={false} accent="var(--green-600)" />
      {loggedIn ? (
        <Link to={home} style={cta}>{t('billing.mine.backToSpace')}</Link>
      ) : (
        <Link to="/signup" style={cta}>{t('offers.free.cta')}</Link>
      )}
    </article>
  );
}

/** Liste de bénéfices (RG-MKT-05) : actuel = coche ; « À venir » = horloge, texte atténué, pastille. */
function FeatureList({ prefix, items, dark, accent }: { prefix: string; items: Feature[]; dark: boolean; accent: string }) {
  const { t } = useTranslation();
  const soonText = dark ? 'var(--green-100)' : 'var(--ink-500)';
  const nowText = dark ? 'var(--ivory)' : 'var(--ink-900)';
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((f) => (
        <li key={f.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.45 }}>
          {f.soon ? (
            <Icon name="clock" size={18} style={{ color: dark ? 'var(--green-500)' : 'var(--ink-400)', flexShrink: 0, marginTop: 2 }} />
          ) : (
            <Icon name="check" size={18} style={{ color: accent, flexShrink: 0, marginTop: 2 }} />
          )}
          <span style={{ color: f.soon ? soonText : nowText, opacity: f.soon && dark ? 0.85 : 1 }}>
            <strong style={{ fontWeight: 600 }}>{t(`${prefix}.${f.key}.title`)}</strong> — {t(`${prefix}.${f.key}.desc`)}
            {/* Constat MKT n°5 (JP 29/10) : pastille « À venir » = composant `Badge` existant (comme le tableau). */}
            {f.soon && (
              <span style={{ marginLeft: 6 }}>
                <Badge tone="gray">{t('offers.soon')}</Badge>
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Carte Caleb (claire, bord terre) ou Néhémie (sombre) — RG-MKT-04 / 06. */
function PlanCard({
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
  const dark = kind === 'nehemie';
  const c = dark
    ? {
        bg: 'var(--green-800)',
        border: 'none',
        title: 'var(--ivory-raised)',
        text: 'var(--green-100)',
        verse: 'var(--earth-400)',
        pillBg: 'var(--green-700)',
        pillFg: 'var(--earth-100)',
        scopeBg: 'var(--green-700)',
        scopeFg: 'var(--green-50)',
        accent: 'var(--earth-400)',
        ring: 'var(--earth-400)',
      }
    : {
        bg: 'var(--ivory-raised)',
        border: '2px solid var(--earth-600)',
        title: 'var(--green-900)',
        text: 'var(--ink-700)',
        verse: 'var(--earth-700)',
        pillBg: 'var(--earth-50)',
        pillFg: 'var(--earth-700)',
        scopeBg: 'var(--ivory)',
        scopeFg: 'var(--ink-700)',
        accent: 'var(--earth-600)',
        ring: 'var(--green-600)',
      };
  // D-CUR-03 / RG-CUR-20 / 22 (JP 28/10) : ligne de prix de la devise choisie (sinon EUR, mention) ;
  // pastille « 2 mois offerts » si l'annuel existe DANS la devise affichée.
  const [chosen] = useCurrencyChoice();
  const sel = priceFor(pricesOf(plan), chosen);
  const hasAnnual = hasAnnualPrice(sel?.price);
  const small = dark ? 'var(--green-100)' : 'var(--ink-500)';
  return (
    <article
      id={`offer-${kind}`}
      aria-labelledby={`offer-${kind}-title`}
      style={{
        background: c.bg,
        border: c.border,
        borderRadius: 20,
        padding: 'clamp(20px, 5vw, 28px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        color: dark ? 'var(--ivory)' : undefined,
        scrollMarginTop: 24,
        minWidth: 0,
        // RG-MKT-11 / RG-PAY-31 : carte demandée par `?offer=` surlignée.
        boxShadow: highlighted ? `0 0 0 3px ${c.ring}` : undefined,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={pill(c.pillBg, c.pillFg)}>{t(`offers.${kind}.audience`)}</span>
        <h2 id={`offer-${kind}-title`} style={{ margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: c.title }}>
          {t(`offers.${kind}.name`)}
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: c.text }}>{t(`offers.${kind}.tagline`)}</p>
        <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: c.verse }}>
          {t(`offers.${kind}.verse`)} — {t(`offers.${kind}.verseRef`)}
        </p>
      </div>

      {showPrices && (
        <div>
          {plansLoading ? (
            <span style={{ color: small, fontSize: 13 }}>{t('common.loading')}</span>
          ) : plan && sel ? (
            <>
              {/* RG-ABO-05 / RG-MKT-06 : centimes du serveur, formatés selon la langue et la devise, jamais recalculés. */}
              <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 34, color: c.title }}>
                {fmtCents(sel.price.monthlyPriceCents, sel.price.currency, lang)}
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: small }}>
                  {' '}
                  {t('offers.price.perMonthTtc')}
                  {hasAnnual && <> · {t('offers.price.orAnnual', { price: fmtCents(sel.price.annualPriceCents as number, sel.price.currency, lang) })}</>}
                </span>
              </p>
              <EurOnlyNote show={sel.fallback} color={small} />
              {hasAnnual && (
                <p style={{ ...pill(c.pillBg, c.pillFg), margin: '6px 0 0', padding: '3px 10px' }}>{t('offers.annualBadge')}</p>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 13, color: small }}>
                {plan.localPriceLabel ? t('offers.price.local', { label: plan.localPriceLabel }) : t('offers.price.localNoLabel')}
                {dark && <> · {t('offers.price.perCity')}</>} · {t('offers.price.noCommitment')}
              </p>
            </>
          ) : (
            <span style={{ color: small, fontSize: 13 }}>{t('offers.priceUnavailable')}</span>
          )}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: c.scopeFg, background: c.scopeBg, borderRadius: 12, padding: '12px 14px' }}>
        <Trans i18nKey={`offers.${kind}.scope`} components={{ strong: <strong /> }} />
      </p>

      <FeatureList prefix={`offers.${kind}.features`} items={kind === 'caleb' ? CALEB_FEATURES : NEHEMIE_FEATURES} dark={dark} accent={c.accent} />

      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </article>
  );
}

/** Tableau comparatif (RG-MKT-09) — défilement horizontal DANS son conteneur, jamais de la page. */
function CompareTable() {
  const { t } = useTranslation();
  const cols = ['free', 'caleb', 'nehemie'] as const;
  const cell = (row: string, col: (typeof cols)[number], kind: Cell) =>
    kind === 'dash' ? (
      <span style={{ color: 'var(--ink-400)' }}>—</span>
    ) : kind === 'soon' ? (
      <Badge tone="gray">{t('offers.soon')}</Badge>
    ) : (
      t(`offers.compare.rows.${row}.${col}`)
    );
  const th: CSSProperties = { padding: '14px 18px', fontWeight: 600, textAlign: 'left' };
  return (
    <section id="comparer" style={{ maxWidth: 1000, margin: '0 auto', padding: `0 ${GUTTER} 56px`, scrollMarginTop: 24 }}>
      <h2 style={{ margin: '0 0 20px', fontFamily: 'var(--font-serif)', fontSize: 'clamp(26px, 5vw, 32px)', fontWeight: 600, color: 'var(--green-900)', textAlign: 'center' }}>
        {t('offers.compare.title')}
      </h2>
      <div style={{ overflowX: 'auto', background: 'var(--ivory-raised)', border: '1px solid var(--parchment-deep)', borderRadius: 16 }}>
        <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ color: 'var(--ink-500)' }}>
              <th style={th}>{t('offers.compare.head.feature')}</th>
              <th style={th}>{t('offers.compare.head.free')}</th>
              <th style={{ ...th, color: 'var(--earth-700)' }}>{t('offers.compare.head.caleb')}</th>
              <th style={{ ...th, color: 'var(--green-800)' }}>{t('offers.compare.head.nehemie')}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((r) => (
              <tr key={r.key} style={{ borderTop: '1px solid var(--line-soft)' }}>
                <td style={{ padding: '12px 18px', color: 'var(--ink-900)' }}>{t(`offers.compare.rows.${r.key}.label`)}</td>
                {cols.map((col) => (
                  <td key={col} style={{ padding: '12px 18px', color: 'var(--ink-700)' }}>{cell(r.key, col, r[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink-500)', textAlign: 'center' }}>{t('offers.compare.note')}</p>
    </section>
  );
}

/** FAQ (RG-MKT-10) : 6 questions de la maquette, liste ouverte. */
function Faq() {
  const { t } = useTranslation();
  return (
    <section id="faq" style={{ maxWidth: 820, margin: '0 auto', padding: `0 ${GUTTER} 72px`, scrollMarginTop: 24 }}>
      <h2 style={{ margin: '0 0 20px', fontFamily: 'var(--font-serif)', fontSize: 'clamp(26px, 5vw, 32px)', fontWeight: 600, color: 'var(--green-900)', textAlign: 'center' }}>
        {t('offers.faq.title')}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FAQ_ITEMS.map((k) => (
          <div key={k} style={{ background: 'var(--ivory-raised)', border: '1px solid var(--parchment-deep)', borderRadius: 14, padding: '18px 20px' }}>
            <h3 style={{ margin: 0, fontWeight: 600, fontSize: 15.5, color: 'var(--green-900)' }}>{t(`offers.faq.items.${k}.q`)}</h3>
            <p style={{ margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-700)' }}>{t(`offers.faq.items.${k}.a`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OffersFooter() {
  const { t } = useTranslation();
  return (
    <footer style={{ borderTop: '1px solid var(--parchment-deep)', padding: `24px ${GUTTER}`, textAlign: 'center', fontSize: 13, color: 'var(--ink-500)' }}>
      {t('offers.footer')}
    </footer>
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
  return <p style={{ margin: 0, color: 'var(--ink-700)', fontSize: 13.5, lineHeight: 1.5 }}>{t(`offers.${kind}.reserved`)}</p>;
}

/**
 * Constat PAY (plan 28_10_2026/03 §12, JP 29/10) : une erreur réseau / 5xx de `/entitlements/personal`
 * ou de `/study/localities` n'est plus lue comme « offre réservée » — message et « Réessayer ».
 */
function LoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, color: 'var(--err)', fontSize: 13.5, lineHeight: 1.5 }}>{t('offers.pay.loadError')}</p>
      <Button variant="secondary" size="sm" disabled={retrying} onClick={onRetry} style={{ alignSelf: 'flex-start' }}>
        {t('offers.pay.retry')}
      </Button>
    </div>
  );
}

/**
 * RG-PAY-30 : déconnecté — se connecter d'abord (D-PAY-04 : pas de paiement anonyme).
 * D-MKT-01 (JP 28/10, RG-MKT-07) : bouton « Se connecter pour s'abonner » et sous-texte de la maquette.
 */
function LoginActions({ kind, dark }: { kind: OfferKind; dark: boolean }) {
  const { t } = useTranslation();
  const back = encodeURIComponent(`/offres?offer=${kind}`);
  const next = `/login?next=${back}`;
  const sub = dark ? 'var(--green-100)' : 'var(--ink-500)';
  const link = dark ? 'var(--earth-400)' : 'var(--green-700)';
  return (
    <>
      <Link
        to={next}
        style={{
          padding: '14px 18px',
          borderRadius: 12,
          background: dark ? 'var(--earth-400)' : 'var(--green-800)',
          color: dark ? 'var(--green-900)' : 'var(--ivory)',
          textAlign: 'center',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        {t('offers.pay.loginToSubscribe')}
      </Link>
      {/* Constat MKT n°5 (JP 29/10) : « En un clic avec Google ou Apple » seulement si un bouton est configuré. */}
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: sub, textAlign: 'center' }}>
        {t(SOCIAL_SIGN_IN_CONFIGURED ? `offers.${kind}.loginHint` : `offers.${kind}.loginHintNoSocial`)}
      </p>
      {/* D-FIX-3A (JP 29/10) : l'inscription ramène ici (`next` conservé). */}
      <p style={{ margin: 0, fontSize: 13, color: sub, textAlign: 'center' }}>
        {t('offers.noAccount')}{' '}
        <Link to={`/signup?next=${back}`} style={{ color: link, fontWeight: 600 }}>{t('billing.offers.signup')}</Link>
      </p>
    </>
  );
}

/** Choix Mensuel / Annuel, partagé Caleb / Néhémie (D-MKT-03, RG-MKT-08). */
function PeriodChoice({ value, onChange }: { value: BillingPeriod; onChange: (p: BillingPeriod) => void }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t('offers.period.label')} style={{ display: 'flex', gap: 6 }}>
      {(['MONTHLY', 'ANNUAL'] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          onClick={() => onChange(p)}
          className={`btn sm ${value === p ? 'primary' : 'secondary'}`}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          {t(`offers.period.${p}`)}
        </button>
      ))}
    </div>
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
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  const [chosen] = useCurrencyChoice();
  const personalQ = useQuery({ queryKey: ['entitlements', 'personal'], queryFn: getPersonalEntitlements, retry: false });
  // D-MKT-03 (JP 28/10, RG-MKT-08) : mensuel ou annuel ; jamais de `localityId` (400
  // `PERSONAL_PLAN_LOCALITY_FORBIDDEN`) ; RG-PAY-32 : `origin: 'OFFERS'` — l'annulation Stripe revient
  // sur /offres?offer=caleb&annule=1.
  const checkoutM = useMutation({
    // D-CUR-04 (JP 28/10) : devise affichée envoyée à la caisse.
    mutationFn: (v: { offerCode: string; period: BillingPeriod; currency: BillingCurrency }) =>
      checkout(v.offerCode, null, { period: v.period, origin: 'OFFERS', currency: v.currency }),
    onSuccess: (res) => window.location.assign(res.url),
  });
  // R-06 (plan 07 §10.4, JP 29/10) : changer de devise efface l'erreur de caisse née dans l'autre.
  useEffect(() => {
    checkoutM.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);
  const portalM = useMutation({
    mutationFn: (reference: string) => openBillingPortal(reference),
    onSuccess: (res) => window.location.assign(res.url),
  });

  if (personalQ.isLoading) return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13.5 }}>{t('common.loading')}</p>;
  if (personalQ.isError) return <LoadError onRetry={() => void personalQ.refetch()} retrying={personalQ.isFetching} />;
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
    return <p style={{ margin: 0, color: 'var(--ink-700)', fontSize: 13.5 }}>{t('hierarchy.lock.pending')}</p>;
  }
  // Constat PAY (JP 29/10) : PAST_DUE hors grâce traité comme dans `LockedFeature` — le payeur d'un plan
  // personnel est toujours l'appelant : « Mettre à jour ma carte » (portail Stripe), ni carte ni Mobile Money.
  if (sub?.status === 'PAST_DUE') {
    return (
      <>
        <p style={{ margin: 0, color: 'var(--err)', fontSize: 13.5 }}>{t('hierarchy.lock.pastDue')}</p>
        {sub.source === 'STRIPE' && (
          <Button variant="primary" style={{ justifyContent: 'center' }} disabled={portalM.isPending} onClick={() => portalM.mutate(sub.reference)}>
            {t('cityStudy.lock.updateCard')}
          </Button>
        )}
        {portalM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(portalM.error, t)}</p>}
      </>
    );
  }
  // D-PAY-07 : sans droit de souscrire (serveur), ni carte ni Mobile Money.
  if (!plan || !plan.canSubscribe) return <ReservedText kind="caleb" />;
  // Prix de la période choisie : centimes du serveur (`PersonalPlan.prices`), jamais recalculés
  // (RG-ABO-05) ; devise choisie, sinon EUR (RG-CUR-20).
  const sel = priceFor(pricesOf(plan), chosen);
  const currency: BillingCurrency = sel?.price.currency ?? 'EUR';
  const hasAnnual = hasAnnualPrice(sel?.price);
  const effPeriod: BillingPeriod = hasAnnual ? period : 'MONTHLY';
  // R-05 (plan 07 §10.4, JP 29/10) : la période du Mobile Money (FCFA) ne dépend pas de la devise carte —
  // c'est celle choisie, dès que l'offre a un annuel dans une devise.
  const anyAnnual = pricesOf(plan).some((p) => hasAnnualPrice(p));
  const mmPeriod: BillingPeriod = anyAnnual ? period : 'MONTHLY';
  const price = fmtCents(sel ? centsFor(sel.price, effPeriod) : plan.monthlyPriceCents, currency, i18n.language);
  return (
    <>
      <PayTitle />
      {anyAnnual && (
        <PeriodChoice
          value={period}
          onChange={(p) => {
            setPeriod(p);
            checkoutM.reset();
          }}
        />
      )}
      <Button
        variant="primary"
        style={{ justifyContent: 'center' }}
        disabled={checkoutM.isPending}
        onClick={() => checkoutM.mutate({ offerCode: plan.offerCode, period: effPeriod, currency })}
      >
        {checkoutM.isPending
          ? t('billing.offers.redirecting')
          : t(effPeriod === 'ANNUAL' ? 'offers.pay.cardAnnual' : 'offers.pay.cardMonthly', { price })}
      </Button>
      {checkoutM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(checkoutM.error, t)}</p>}
      {/* Constat MKT n°5 (JP 29/10) : le message ne porte QUE la formule choisie et son prix local. */}
      <MobileMoneyButton
        message={mobileMoneyMessage(t, { offer: 'caleb', localPrice: localPriceForPeriod(localPriceLabel, mmPeriod), username, period: mmPeriod })}
      />
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
  const [chosen] = useCurrencyChoice();
  // Même clé que la Sidebar : une seule lecture de `/study/localities` (vide pour un membre / un
  // dirigeant d'unité, RG-ABO-22).
  const citiesQ = useQuery({ queryKey: ['assembly', 'study', 'localities'], queryFn: listStudyLocalities, retry: false });
  const cities = citiesQ.data ?? [];
  const eligible = cities.filter((c) => c.canSubscribe);
  // D-FIX-4A (JP 29/10) : une ville couverte par un accord (`agreement`, serveur) ne se paie pas.
  const open = eligible.filter((c) => !c.entitled && !c.agreement);

  // Présélection quand une seule ville peut être payée (RG-PAY-34).
  const onlyOpenId = open.length === 1 ? open[0].localityId : null;
  useEffect(() => {
    if (!cityId && onlyOpenId) setCityId(onlyOpenId);
  }, [cityId, onlyOpenId]);

  // RG-PAY-34 / 36 : ville + période, `origin: 'OFFERS'` (annulation → /offres?offer=nehemie&annule=1).
  const checkoutM = useMutation({
    // D-CUR-04 (JP 28/10) : devise affichée envoyée à la caisse.
    mutationFn: (v: { offerCode: string; localityId: string; period: BillingPeriod; currency: BillingCurrency }) =>
      checkout(v.offerCode, null, { localityId: v.localityId, period: v.period, origin: 'OFFERS', currency: v.currency }),
    onSuccess: (res) => window.location.assign(res.url),
  });
  // R-06 (plan 07 §10.4, JP 29/10) : changer de devise efface l'erreur de caisse née dans l'autre
  // (période et ville l'effacent à leur changement).
  useEffect(() => {
    checkoutM.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);
  // Constat PAY (JP 29/10) : état de l'abonnement de la ville choisie (même clé que le verrou web) —
  // PENDING, PAST_DUE hors grâce et, D-FIX-4A, ville ouverte par un accord de ministère.
  const entQ = useQuery({
    queryKey: ['entitlements', cityId],
    queryFn: () => getEntitlements(cityId),
    enabled: !!cityId,
    retry: false,
  });
  const portalM = useMutation({
    mutationFn: (reference: string) => openBillingPortal(reference),
    onSuccess: (res) => window.location.assign(res.url),
  });

  if (citiesQ.isLoading) return <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13.5 }}>{t('common.loading')}</p>;
  if (citiesQ.isError) return <LoadError onRetry={() => void citiesQ.refetch()} retrying={citiesQ.isFetching} />;
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
  // RG-CUR-20 / 22 (JP 28/10) : ligne de la devise choisie (sinon EUR) ; annuel dans cette devise.
  const sel = priceFor(pricesOf(publicPlan), chosen);
  const currency: BillingCurrency = sel?.price.currency ?? 'EUR';
  const hasAnnual = hasAnnualPrice(sel?.price);
  const effPeriod: BillingPeriod = hasAnnual ? period : 'MONTHLY';
  // R-05 (JP 29/10) : période du Mobile Money = celle choisie, indépendante de la devise carte.
  const anyAnnual = pricesOf(publicPlan).some((p) => hasAnnualPrice(p));
  const mmPeriod: BillingPeriod = anyAnnual ? period : 'MONTHLY';
  const price = sel ? fmtCents(centsFor(sel.price, effPeriod), currency, i18n.language) : null;
  // État de la ville choisie (`GET /entitlements?nodeId=`), comme `LockActions` de `LockedFeature`.
  const ent = city && entQ.data?.nodeId === city.localityId ? entQ.data : null;
  const citySubs = ent?.subscriptions ?? [];
  const pendingSub = citySubs.find((x) => x.status === 'PENDING');
  const pastDueSub = citySubs.find((x) => x.status === 'PAST_DUE' && !x.entitled);
  // D-FIX-4A (JP 29/10) : accord `sub_subscription` (ministère / nation / région, D-ABO-28) lu du
  // SERVEUR (`StudyLocalitySummary.agreement`, tout code du plan — même règle que la caisse, qui
  // refuse la ville en 422) ; plus aucune déduction front depuis `entitled` / `/entitlements`.
  const byAgreement = !!city?.agreement;

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
            meta: c.agreement ? t('offers.nehemie.alreadyActiveAgreement') : c.entitled ? t('offers.nehemie.alreadyActive') : undefined,
          }))}
        />
      </div>
      {anyAnnual && (
        <PeriodChoice
          value={period}
          onChange={(p) => {
            setPeriod(p);
            checkoutM.reset();
          }}
        />
      )}
      {city?.entitled || byAgreement ? (
        <div>
          <Badge tone="ok" dot>{t(byAgreement ? 'offers.nehemie.alreadyActiveAgreement' : 'offers.nehemie.alreadyActive')}</Badge>
        </div>
      ) : city && entQ.isLoading ? (
        <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 13.5 }}>{t('common.loading')}</p>
      ) : pendingSub ? (
        // Constat PAY (JP 29/10) : paiement en cours pour cette ville — aucun bouton (comme le verrou).
        <p style={{ margin: 0, color: 'var(--ink-700)', fontSize: 13.5 }}>{t('cityStudy.lock.pending')}</p>
      ) : pastDueSub ? (
        <>
          <p style={{ margin: 0, color: 'var(--err)', fontSize: 13.5 }}>{t('cityStudy.lock.pastDue')}</p>
          {pastDueSub.paidByMe && pastDueSub.source === 'STRIPE' ? (
            <Button variant="primary" style={{ justifyContent: 'center' }} disabled={portalM.isPending} onClick={() => portalM.mutate(pastDueSub.reference)}>
              {t('cityStudy.lock.updateCard')}
            </Button>
          ) : (
            <p style={{ margin: 0, color: 'var(--ink-700)', fontSize: 13.5 }}>
              {t('cityStudy.lock.managedBy', { name: pastDueSub.payerName ?? t('cityStudy.subscription.unknownPayer') })}
            </p>
          )}
          {portalM.isError && <p style={{ margin: 0, color: 'var(--err)', fontSize: 13 }}>{billingErrMsg(portalM.error, t)}</p>}
        </>
      ) : (
        <>
          {publicPlan && price && (
            <Button
              variant="primary"
              style={{ justifyContent: 'center' }}
              disabled={!city || checkoutM.isPending}
              onClick={() => city && checkoutM.mutate({ offerCode: publicPlan.offerCode, localityId: city.localityId, period: effPeriod, currency })}
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
                // Constats PAY / MKT (JP 29/10) : prix local de la formule choisie seulement.
                localPrice: localPriceForPeriod(publicPlan?.localPriceLabel, mmPeriod),
                username,
                city: city.localityName,
                period: mmPeriod,
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
