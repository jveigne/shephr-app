import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import { AppShell } from './AppShell';
import { MemberShell } from './MemberShell';
import { LandingPage } from './pages/Landing';
import { LoginPage } from './pages/Login';
import { AcceptInvitationPage } from './pages/AcceptInvitation';
import { ActivateAccountPage } from './pages/ActivateAccount';
import { DeleteAccountPage } from './pages/DeleteAccount';
import { DashboardPage } from './pages/Dashboard';
import { DonationsPage } from './pages/Donations';
import { GoalsPage } from './pages/Goals';
import { MemberCarePage } from './pages/MemberCare';
import { UsersPage } from './pages/Users';
import { MonMinisterePage } from './pages/MonMinistere';
import { PaysPage } from './pages/Pays';
import { ZonesPage } from './pages/Zones';
import { LocalitesPage } from './pages/Localites';
import { UnitesPage } from './pages/Unites';
import { ExportsPage } from './pages/Exports';
import { HierarchyPage } from './pages/Hierarchy';
import { RequestsPage } from './pages/Requests';
import { MemberGoalsPage } from './pages/MemberGoals';
import { OnboardingPage } from './pages/Onboarding';
import { SettingsPage } from './pages/Settings';
import { FEATURES } from './config/features';

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
        <AuthProvider>
          <ToastProvider>
            <Routes>
              {/* Landing publique : présentation + fonctionnalités + tarification. */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/activate" element={<ActivateAccountPage />} />
              <Route path="/invitation/:token" element={<AcceptInvitationPage />} />
              {/* Page publique exigée par Google Play : demande de suppression de compte. */}
              <Route path="/delete-account" element={<DeleteAccountPage />} />
              <Route path="/supprimer-compte" element={<DeleteAccountPage />} />
              {/* Feature B — onboarding : authentifié mais HORS AppShell (aucun rattachement). */}
              <Route path="/join" element={<OnboardingPage />} />
              {/* Feature A — espace membre minimal (MEMBRE Goals rattaché), gaté par MemberShell. */}
              <Route element={<MemberShell />}>
                <Route path="/my-goals" element={<MemberGoalsPage />} />
                <Route path="/member-settings" element={<SettingsPage />} />
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
                <Route path="/member-care" element={<MemberCarePage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/structure/ministeres" element={<MonMinisterePage />} />
                <Route path="/structure/pays" element={<PaysPage />} />
                <Route path="/structure/zones" element={<ZonesPage />} />
                <Route path="/structure/localites" element={<LocalitesPage />} />
                <Route path="/structure/unites" element={<UnitesPage />} />
                <Route path="/hierarchy" element={<HierarchyPage />} />
                <Route path="/requests" element={<RequestsPage />} />
                {FEATURES.donations ? (
                  <Route path="/exports" element={<ExportsPage />} />
                ) : (
                  <Route path="/exports" element={<Navigate to={HOME} replace />} />
                )}
                {/* Feature C — vraie page Réglages (identité + suppression de compte). */}
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to={HOME} replace />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
