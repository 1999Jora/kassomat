import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import POSLayout from './pages/POSLayout';
import PINLock from './components/PINLock';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import DepExportPage from './pages/DepExportPage';
import HomeScreen from './pages/HomeScreen';
import DriverNavPage from './pages/DriverNavPage';
import DispatcherPage from './pages/DispatcherPage';
import DriversPage from './pages/DriversPage';
import { useAppStore } from './store/useAppStore';
import { useRealtimeOrders } from './hooks/useRealtimeOrders';
import { ThemeProvider } from './context/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
});

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
};
const pageTransition = { duration: 0.18 };

function PINGate({ children }: { children: React.ReactNode }) {
  const isLocked = useAppStore((s) => s.isLocked);
  useRealtimeOrders();
  if (isLocked) return <PINLock />;
  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
        style={{ height: '100%' }}
      >
        <Routes location={location}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Home screen — tile selection */}
          <Route path="/" element={
            <ProtectedRoute><HomeScreen /></ProtectedRoute>
          } />

          {/* POS */}
          <Route path="/pos" element={
            <ProtectedRoute>
              <PINGate><POSLayout /></PINGate>
            </ProtectedRoute>
          } />

          {/* Driver navigation — no auth needed, uses driver PIN */}
          <Route path="/delivery/nav" element={<DriverNavPage />} />

          {/* Dispatcher */}
          <Route path="/dispatcher" element={
            <ProtectedRoute><DispatcherPage /></ProtectedRoute>
          } />

          {/* Dashboard */}
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
          <Route path="/drivers" element={
            <ProtectedRoute>
              <AdminLayout><DriversPage /></AdminLayout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
