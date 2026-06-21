import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import { AppShell } from './AppShell';
import { LandingPage } from './pages/Landing';
import { LoginPage } from './pages/Login';
import { AcceptInvitationPage } from './pages/AcceptInvitation';
import { DashboardPage } from './pages/Dashboard';
import { DonationsPage } from './pages/Donations';
import { GoalsPage } from './pages/Goals';
import { MemberCarePage } from './pages/MemberCare';
import { UsersPage } from './pages/Users';
import { MonMinisterePage } from './pages/MonMinistere';
import { ZonesPage } from './pages/Zones';
import { LocalitesPage } from './pages/Localites';
import { UnitesPage } from './pages/Unites';
import { ExportsPage } from './pages/Exports';
import { Placeholder } from './pages/Placeholder';
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
              <Route path="/invitation/:token" element={<AcceptInvitationPage />} />
              <Route element={<AppShell />}>
                {FEATURES.donations ? (
                  <>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/donations" element={<DonationsPage />} />
                  </>
                ) : (
                  <>
                    <Route path="/dashboard" element={<Navigate to="/goals" replace />} />
                    <Route path="/donations" element={<Navigate to="/goals" replace />} />
                  </>
                )}
                <Route path="/goals" element={<GoalsPage />} />
                <Route path="/member-care" element={<MemberCarePage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/structure/ministeres" element={<MonMinisterePage />} />
                <Route path="/structure/zones" element={<ZonesPage />} />
                <Route path="/structure/localites" element={<LocalitesPage />} />
                <Route path="/structure/unites" element={<UnitesPage />} />
                <Route
                  path="/hierarchy"
                  element={
                    <Placeholder
                      titleKey="placeholder.hierarchyTitle"
                      crumbKeys={['common.brand', 'placeholder.hierarchyTitle']}
                      descriptionKey="placeholder.hierarchyDescription"
                      endpointHint="GET /api/church/admin/leaders/{assignment|hierarchy}"
                    />
                  }
                />
                {FEATURES.donations ? (
                  <Route path="/exports" element={<ExportsPage />} />
                ) : (
                  <Route path="/exports" element={<Navigate to="/goals" replace />} />
                )}
                <Route
                  path="/settings"
                  element={
                    <Placeholder
                      titleKey="placeholder.settingsTitle"
                      crumbKeys={['common.brand', 'placeholder.settingsTitle']}
                      descriptionKey="placeholder.settingsDescription"
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
