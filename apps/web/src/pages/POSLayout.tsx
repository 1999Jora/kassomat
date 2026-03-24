import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Header from '../components/Header';
import ArticleGrid from '../components/ArticleGrid';
import Cart from '../components/Cart';
import PaymentPanel from '../components/PaymentPanel';
import OrderNotification from '../components/OrderNotification';
import { useAppStore } from '../store/useAppStore';
import { initAudio } from '../lib/sounds';

export default function POSLayout() {
  const { pendingOrders, cartItems } = useAppStore();
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'articles' | 'cart' | 'payment'>('articles');

  // AudioContext erst nach erster User-Geste entsperren (Browser-Autoplay-Policy)
  useEffect(() => {
    const unlock = () => { initAudio(); document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock);
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);

  // Auto-open order panel when new orders arrive
  useEffect(() => {
    if (pendingOrders.length > 0) {
      setOrdersOpen(true);
    }
  }, [pendingOrders.length]);

  return (
    <div className="h-screen bg-[#080a0c] text-white flex flex-col overflow-hidden font-mono">
      <Header onOrdersClick={() => setOrdersOpen((o) => !o)} />

      {/* Desktop: 3 columns | Tablet: Articles + right panel (Cart+Payment stacked) | Mobile: tabs */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Articles - always visible on md+, on mobile only when tab=articles */}
        <div className={`${mobileTab === 'articles' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 border-r border-white/[0.06] overflow-hidden flex-col`}>
          <ArticleGrid />
        </div>

        {/* Mobile: Cart tab */}
        <div className={`${mobileTab === 'cart' ? 'flex' : 'hidden'} md:hidden w-full overflow-hidden flex-col`}>
          <Cart />
        </div>

        {/* Mobile: Payment tab */}
        <div className={`${mobileTab === 'payment' ? 'flex' : 'hidden'} md:hidden w-full overflow-hidden flex-col`}>
          <PaymentPanel />
        </div>

        {/* Tablet (md-lg): Cart + Payment stacked vertically in right panel */}
        {/* Desktop (lg+): Cart + Payment side by side */}
        <div className="hidden md:flex flex-col lg:flex-row shrink-0 w-[300px] lg:w-auto">
          <div className="flex flex-col lg:w-[280px] xl:w-[320px] border-b border-white/[0.06] lg:border-b-0 lg:border-r lg:border-white/[0.06] overflow-hidden flex-1 lg:flex-none">
            <Cart />
          </div>
          <div className="flex flex-col lg:w-[256px] xl:w-[288px] overflow-hidden shrink-0 lg:flex-none">
            <PaymentPanel />
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden border-t border-white/[0.06] bg-[#0e1115] flex shrink-0">
        {(
          [
            {
              id: 'articles' as const,
              label: 'Artikel',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              ),
            },
            {
              id: 'cart' as const,
              label: 'Bon',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              ),
            },
            {
              id: 'payment' as const,
              label: 'Zahlung',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              ),
            },
          ] as Array<{ id: 'articles' | 'cart' | 'payment'; label: string; icon: React.ReactNode }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[10px] font-medium transition-colors relative ${
              mobileTab === tab.id ? 'text-[#00e87a]' : 'text-[#6b7280]'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'cart' && cartItems.length > 0 && (
              <span className="absolute top-2 right-1/4 w-4 h-4 rounded-full bg-[#00e87a] text-black text-[8px] font-bold flex items-center justify-center">
                {cartItems.length}
              </span>
            )}
          </button>
        ))}
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
