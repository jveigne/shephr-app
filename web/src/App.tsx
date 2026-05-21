import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import { AppShell } from './AppShell';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { DonationsPage } from './pages/Donations';
import { UsersPage } from './pages/Users';
import { Placeholder } from './pages/Placeholder';

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
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/donations" element={<DonationsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route
                  path="/structure/ministeres"
                  element={
                    <Placeholder
                      title="Ministères"
                      crumbs={['shephr', 'Structure', 'Ministères']}
                      description="Gestion des ministères (CMCI UK, etc.) à venir."
                      endpointHint="GET /api/church/admin/ministries"
                    />
                  }
                />
                <Route
                  path="/structure/localites"
                  element={
                    <Placeholder
                      title="Localités"
                      crumbs={['shephr', 'Structure', 'Localités']}
                      description="Londres, Birmingham, Édimbourg… à venir."
                      endpointHint="GET /api/church/admin/localities"
                    />
                  }
                />
                <Route
                  path="/structure/unites"
                  element={
                    <Placeholder
                      title="Unités"
                      crumbs={['shephr', 'Structure', 'Unités']}
                      description="Centres et assemblées par localité — à venir."
                      endpointHint="GET /api/church/admin/units"
                    />
                  }
                />
                <Route
                  path="/hierarchy"
                  element={
                    <Placeholder
                      title="Hiérarchie des dirigeants"
                      crumbs={['shephr', 'Hiérarchie']}
                      description="Attributions dirigeant ↔ unité et supervision senior-junior."
                      endpointHint="GET /api/church/admin/leaders/{assignment|hierarchy}"
                    />
                  }
                />
                <Route
                  path="/exports"
                  element={
                    <Placeholder
                      title="Exports"
                      crumbs={['shephr', 'Exports']}
                      description="Génération de CSV par période, localité, unité, catégorie."
                      endpointHint="GET /api/church/donations/export?format=csv"
                    />
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <Placeholder
                      title="Paramètres"
                      crumbs={['shephr', 'Paramètres']}
                      description="Profil, notifications, sécurité, devises et catégories."
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
