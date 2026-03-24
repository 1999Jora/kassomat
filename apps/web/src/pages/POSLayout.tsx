import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Header from '../components/Header';
import ArticleGrid from '../components/ArticleGrid';
import Cart from '../components/Cart';
import PaymentPanel from '../components/PaymentPanel';
import OrderNotification from '../components/OrderNotification';
import { useAppStore } from '../store/useAppStore';

export default function POSLayout() {
  const { pendingOrders } = useAppStore();
  const [ordersOpen, setOrdersOpen] = useState(false);

  // Auto-open order panel when new orders arrive
  useEffect(() => {
    if (pendingOrders.length > 0) {
      setOrdersOpen(true);
    }
  }, [pendingOrders.length]);

  return (
    <div className="h-screen bg-[#080a0c] text-white flex flex-col overflow-hidden font-mono">
      <Header onOrdersClick={() => setOrdersOpen((o) => !o)} />

      {/* 3-column main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Column 1: Article grid (~flex-grow) */}
        <div className="flex-1 min-w-0 border-r border-white/[0.06] overflow-hidden">
          <ArticleGrid />
        </div>

        {/* Column 2: Cart */}
        <div className="w-[280px] xl:w-[320px] 2xl:w-[360px] border-r border-white/[0.06] overflow-hidden shrink-0 flex flex-col">
          <Cart />
        </div>

        {/* Column 3: Payment panel */}
        <div className="w-[256px] xl:w-[288px] 2xl:w-[320px] overflow-hidden shrink-0 flex flex-col bg-[#080a0c]">
          <PaymentPanel />
        </div>
      </div>

      {/* Order notification panel (slide-in) */}
      {ordersOpen && (
        <OrderNotification onClose={() => setOrdersOpen(false)} />
      )}

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0e1115',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '12px',
            fontFamily: '"DM Mono", monospace',
          },
          success: {
            iconTheme: { primary: '#00e87a', secondary: '#000' },
          },
          error: {
            iconTheme: { primary: '#f87171', secondary: '#fff' },
          },
        }}
      />
    </div>
  );
}
