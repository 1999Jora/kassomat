import { useState } from 'react';
import Header from './Header';
import ArticleGrid from './ArticleGrid';
import Cart from './Cart';
import PaymentPanel from './PaymentPanel';
import OrderNotification from './OrderNotification';

export default function POSLayout() {
  const [ordersOpen, setOrdersOpen] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[#080a0c] text-white overflow-hidden">
      <Header onOrdersClick={() => setOrdersOpen((o) => !o)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Articles */}
        <div className="flex-1 overflow-hidden">
          <ArticleGrid />
        </div>

        {/* Cart */}
        <div className="w-[280px] shrink-0 border-l border-white/[0.06] overflow-y-auto">
          <Cart />
        </div>

        {/* Payment */}
        <div className="w-[256px] shrink-0 border-l border-white/[0.06] overflow-y-auto">
          <PaymentPanel />
        </div>
      </div>

      {/* Order slide-in */}
      {ordersOpen && (
        <OrderNotification onClose={() => setOrdersOpen(false)} />
      )}
    </div>
  );
}
