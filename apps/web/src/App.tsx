import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import POSLayout from './components/POSLayout';
import PINLock from './components/PINLock';
import { useAppStore } from './store/useAppStore';
import { useRealtimeOrders } from './hooks/useRealtimeOrders';
import { ThemeProvider } from './context/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 1 },
  },
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
          <PINGate>
            <Routes>
              <Route path="/" element={<POSLayout />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PINGate>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
