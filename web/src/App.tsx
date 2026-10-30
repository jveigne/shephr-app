import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import { ScrollToTop } from './components/ScrollToTop';
import { AppShell } from './AppShell';
import { MemberShell } from './MemberShell';
import { LandingPage } from './pages/Landing';
import { LoginPage } from './pages/Login';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { ResetPasswordPage } from './pages/ResetPassword';
import { SignupPage } from './pages/Signup';
import { AcceptInvitationPage } from './pages/AcceptInvitation';
import { ActivateAccountPage } from './pages/ActivateAccount';
import { DeleteAccountPage } from './pages/DeleteAccount';
import { PrivacyPage } from './pages/Privacy';
import { DashboardPage } from './pages/Dashboard';
import { DonationsPage } from './pages/Donations';
import { GoalsPage } from './pages/Goals';
import { MemberCarePage } from './pages/MemberCare';
import { AssemblyPage } from './pages/Assembly';
import { EventsPage } from './pages/Events';
import { MyActionsPage } from './pages/MyActions';
import { StudyPage } from './pages/Study';
import { StudySessionPage } from './pages/StudySession';
import { CityStudyPage } from './pages/CityStudy';
import { BillingReturnPage, MySubscriptionsPage } from './pages/Billing';
import { OffersPage } from './pages/Offers';
import { UsersPage } from './pages/Users';
import { MonMinisterePage } from './pages/MonMinistere';
import { PaysPage } from './pages/Pays';
import { ZonesPage } from './pages/Zones';
import { LocalitesPage } from './pages/Localites';
import { UnitesPage } from './pages/Unites';
import { ExportsPage } from './pages/Exports';
import { HierarchyPage } from './pages/Hierarchy';
import { HierarchyLeadershipPage } from './pages/HierarchyLeadership';
import { HierarchyLifePage } from './pages/HierarchyLife';
import { RequestsPage } from './pages/Requests';
import { MemberGoalsPage } from './pages/MemberGoals';
import { OnboardingPage } from './pages/Onboarding';
import { SettingsPage } from './pages/Settings';
import { ContactPage } from './pages/Contact';
import { DocumentsPage } from './pages/Documents';
import { FEATURES } from './config/features';

// Lot D4 (plan Documents du 18/10) : lecteur public chargé à la demande — PDF.js et `qrcode` restent
// hors du bundle de l'Espace ministère.
const DocumentReaderPage = lazy(() =>
  import('./pages/DocumentReader').then((m) => ({ default: m.DocumentReaderPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Page d'accueil selon les flags de livraison : Dons > Goals > Member Care.
const HOME = FEATURES.donations ? '/dashboard' : FEATURES.goals ? '/goals' : '/member-care';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Bug JP 29/10 (« Offres » ouverte en bas) : haut de page à chaque changement de chemin. */}
        <ScrollToTop />
        <AuthProvider>
          <ToastProvider>
            <Routes>
              {/* Landing publique : présentation + fonctionnalités + tarification. */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              {/* D-WEB-05 (JP 27/10) — Parité mobile → web : mot de passe oublié, pages publiques hors shell
                  (mêmes endpoints que le mobile ; une session déjà ouverte repart vers son accueil). */}
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {/* Feature B — inscription libre (miroir du parcours mobile), enchaîne sur /join. */}
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/activate" element={<ActivateAccountPage />} />
              <Route path="/invitation/:token" element={<AcceptInvitationPage />} />
              {/* Page publique exigée par Google Play : demande de suppression de compte. */}
              <Route path="/delete-account" element={<DeleteAccountPage />} />
              <Route path="/supprimer-compte" element={<DeleteAccountPage />} />
              {/* Page publique exigée par Google Play : règles de confidentialité. */}
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/confidentialite" element={<PrivacyPage />} />
              {/* Lot D4 — lecteur public d'un document partagé (RG-DOC-02, D-DOC-09) : AUCUNE garde, comme
                  /privacy. Même chemin que le lien universel `https://<domaine>/d/{slug}`
                  (apple-app-site-association / assetlinks). D-DOC-05 levée (JP 27/10, D-WEB-04) : lecture
                  complète sur le web pour un compte connecté et rattaché, aperçu (+ mur) pour les autres. */}
              <Route
                path="/d/:slug"
                element={
                  <Suspense fallback={null}>
                    <DocumentReaderPage />
                  </Suspense>
                }
              />
              {/* Lot ABO4 (§6.1 du plan du 23/10) — abonnements payants, HORS shell. /abonnements est
                  publique (offres) ; retour Stripe et « Mes abonnements » exigent une session, pour TOUT
                  compte, rattaché ou non (D-ABO-05) — la garde est dans la page. D-ABO-01 (JP 23/10) :
                  payer n'active aucun module. */}
              {/* P-11 / O12 (JP 27/10, plan 05) : l'ancienne page publique des offres (« Frais de couverture »,
                  désactivée) est remplacée par /offres — redirection pour les liens existants. */}
              <Route path="/abonnements" element={<Navigate to="/offres" replace />} />
              <Route path="/abonnements/retour" element={<BillingReturnPage />} />
              <Route path="/abonnements/mes-abonnements" element={<MySubscriptionsPage />} />
              {/* O10 (JP 27/10, plan 05 §3.8) — offres Caleb et Néhémie : page PUBLIQUE hors shell (cible du
                  lien « En savoir plus » des verrous du mobile, D-OFF-11, `?offer=caleb|nehemie`) ; entrée de
                  menu `nav.offers` dans l'AppShell seulement. */}
              <Route path="/offres" element={<OffersPage />} />
              {/* Feature B — onboarding : authentifié mais HORS AppShell (aucun rattachement). */}
              <Route path="/join" element={<OnboardingPage />} />
              {/* Feature A — espace membre minimal (MEMBRE Goals rattaché), gaté par MemberShell. */}
              <Route element={<MemberShell />}>
                <Route path="/my-goals" element={<MemberGoalsPage />} />
                {/* D-ASM-17 (JP 25/09) — CR et avancement de son assemblée, en lecture seule. */}
                {FEATURES.assembly && <Route path="/my-assembly" element={<AssemblyPage />} />}
                {/* Lot E8 (§6.2 du plan du 14/10) — D-EVT-14 (JP 14/10) : vue dédiée du membre, les actions
                    de SON assemblée seulement (compteur, programmés, réalisés, Déclarer / Programmer). */}
                {FEATURES.events && <Route path="/my-actions" element={<MyActionsPage />} />}
                {/* D-ETU-31 (JP 23/10, avenant ETU9) : « Le Message de Bertoua », page à part. D-ETU-50
                    (JP 27/10) : Étude GRATUITE — garde = FEATURES.study + compte rattaché (`useStudyAccess`),
                    plus l'abonnement STUDY (D-ETU-28 levée). */}
                {FEATURES.study && <Route path="/my-study" element={<StudyPage />} />}
                {/* D-WEB-02 (JP 27/10, D-ETU-14 levée) : une séance — répondre, corriger, rattraper. */}
                {FEATURES.study && <Route path="/my-study/session/:id" element={<StudySessionPage />} />}
                {/* D-DOC-14 levée (JP 27/10, D-WEB-03) : espace Documents sur le web. Aucun flag de livraison
                    (config/features.ts inchangé, JP-3) : gating = abonnement DOCUMENTS + compte rattaché, dans
                    la page et le menu. */}
                <Route path="/my-documents" element={<DocumentsPage />} />
                <Route path="/member-settings" element={<SettingsPage />} />
                <Route path="/member-contact" element={<ContactPage />} />
              </Route>
              <Route element={<AppShell />}>
                {FEATURES.donations ? (
                  <>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/donations" element={<DonationsPage />} />
                  </>
                ) : (
                  <>
                    <Route path="/dashboard" element={<Navigate to={HOME} replace />} />
                    <Route path="/donations" element={<Navigate to={HOME} replace />} />
                  </>
                )}
                {FEATURES.goals ? (
                  <Route path="/goals" element={<GoalsPage />} />
                ) : (
                  <Route path="/goals" element={<Navigate to={HOME} replace />} />
                )}
                {/* Vie d'assemblée (D-ASM-12, JP 23/09) : flag de livraison ; la page gère en plus
                    l'absence d'abonnement ASSEMBLY (RG-06). */}
                {FEATURES.assembly ? (
                  <Route path="/assembly" element={<AssemblyPage />} />
                ) : (
                  <Route path="/assembly" element={<Navigate to={HOME} replace />} />
                )}
                {/* Évènements (D-EVT-05, JP 14/10) : flag de livraison ; la page gère en plus
                    l'absence d'abonnement EVENTS (RG-06). */}
                {FEATURES.events ? (
                  <Route path="/events" element={<EventsPage />} />
                ) : (
                  <Route path="/events" element={<Navigate to={HOME} replace />} />
                )}
                {/* D-ETU-31 (JP 23/10, avenant ETU9) : l'Étude sort de la Vie d'assemblée ; flag de
                    livraison + compte rattaché. D-ETU-50 (JP 27/10) : plus d'abonnement STUDY (gratuite). */}
                {FEATURES.study ? (
                  <Route path="/study" element={<StudyPage />} />
                ) : (
                  <Route path="/study" element={<Navigate to={HOME} replace />} />
                )}
                {/* D-WEB-02 (JP 27/10, D-ETU-14 levée) : une séance — piloter, répondre, corriger, rattraper. */}
                {FEATURES.study ? (
                  <Route path="/study/session/:id" element={<StudySessionPage />} />
                ) : (
                  <Route path="/study/session/:id" element={<Navigate to={HOME} replace />} />
                )}
                {/* D-WEB-07 (JP 27/10, lot « pro-plan ») : suivi de l'étude de la VILLE (?localityId=&tab=),
                    surface de paiement du plan Église-ville (JP-4). Lecteurs = `GET /study/localities`
                    (RG-ABO-21) ; ETUDE_SUIVI vérifié par ville côté serveur (RG-ABO-23). */}
                {/* P-08 (JP 27/10, plan 05 — offre Néhémie) : la page devient « Suivi de la ville » (Bertoua,
                    Journal de la ville, statistiques d'Évènements) — plus seulement l'étude : la page
                    décide elle-même de ses onglets (flags + modules). Chemin composé par le serveur
                    (retours Stripe) : inchangé. */}
                <Route path="/study/city" element={<CityStudyPage />} />
                <Route path="/member-care" element={<MemberCarePage />} />
                {/* D-DOC-14 levée (JP 27/10, D-WEB-03) : espace Documents sur le web (gating dans la page). */}
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/structure/ministeres" element={<MonMinisterePage />} />
                <Route path="/structure/pays" element={<PaysPage />} />
                <Route path="/structure/zones" element={<ZonesPage />} />
                <Route path="/structure/localites" element={<LocalitesPage />} />
                <Route path="/structure/unites" element={<UnitesPage />} />
                <Route path="/hierarchy" element={<HierarchyPage />} />
                {/* D-HIE-01 (JP 28/10, lot HIE) : 3 sous-pages — « But quinquennal » (gratuite),
                    « Mon leadership » (gratuite, désignation descendante) et « Vie de mon leadership »
                    (offre Caleb, retours Stripe composés par le serveur vers /hierarchy/vie). */}
                <Route path="/hierarchy/leadership" element={<HierarchyLeadershipPage />} />
                <Route path="/hierarchy/vie" element={<HierarchyLifePage />} />
                <Route path="/requests" element={<RequestsPage />} />
                {FEATURES.donations ? (
                  <Route path="/exports" element={<ExportsPage />} />
                ) : (
                  <Route path="/exports" element={<Navigate to={HOME} replace />} />
                )}
                {/* Feature C — vraie page Réglages (identité + suppression de compte). */}
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="*" element={<Navigate to={HOME} replace />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
