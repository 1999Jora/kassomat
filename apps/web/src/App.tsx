import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import POSLayout from './components/POSLayout';
import PINLock from './components/PINLock';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import DepExportPage from './pages/DepExportPage';
import { useAppStore } from './store/useAppStore';
import { useRealtimeOrders } from './hooks/useRealtimeOrders';
import { ThemeProvider } from './context/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
});

function PINGate({ children }: { children: React.ReactNode }) {
  const isLocked = useAppStore((s) => s.isLocked);
  useRealtimeOrders();
  if (isLocked) return <PINLock />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/" element={
              <ProtectedRoute>
                <PINGate>
                  <POSLayout />
                </PINGate>
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <AdminLayout><DashboardPage /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <AdminLayout><SettingsPage /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/dep-export" element={
              <ProtectedRoute>
                <AdminLayout><DepExportPage /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
