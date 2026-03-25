import { create } from 'zustand';
import type { IncomingOrder } from '@kassomat/types';

export interface CartItem {
  productId: string;
  name: string;
  price: number; // cents
  vatRate: 0 | 10 | 13 | 20;
  quantity: number;
  discount: number; // cents
}

interface AppState {
  // Cart
  cartItems: CartItem[];
  cartChannel: 'direct' | 'lieferando' | 'wix';
  cartExternalOrderId: string | null;
  addToCart: (item: Omit<CartItem, 'quantity' | 'discount'>) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;

  // Payment
  paymentMethod: 'cash' | 'card' | 'online';
  setPaymentMethod: (m: 'cash' | 'card' | 'online') => void;

  // Card payment (myPOS)
  cardPaymentState: 'idle' | 'waiting' | 'confirmed' | 'declined' | 'timeout';
  cardTransactionId: string | null;
  setCardPaymentState: (state: AppState['cardPaymentState'], transactionId?: string | null) => void;

  // Orders queue
  pendingOrders: IncomingOrder[];
  addPendingOrder: (order: IncomingOrder) => void;
  removePendingOrder: (orderId: string) => void;

  // UI state
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
  activeCategory: string | null;
  setActiveCategory: (id: string | null) => void;
  pluSearch: string;
  setPluSearch: (s: string) => void;

  // Order notification panel
  showOrderPanel: boolean;
  setShowOrderPanel: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  cartItems: [],
  cartChannel: 'direct',
  cartExternalOrderId: null,
  addToCart: (item) =>
    set((state) => {
      const existing = state.cartItems.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          cartItems: state.cartItems.map((i) =>
            i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        };
      }
      return { cartItems: [...state.cartItems, { ...item, quantity: 1, discount: 0 }] };
    }),
  updateQuantity: (productId, quantity) =>
    set((state) => ({
      cartItems:
        quantity <= 0
          ? state.cartItems.filter((i) => i.productId !== productId)
          : state.cartItems.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    })),
  removeFromCart: (productId) =>
    set((state) => ({ cartItems: state.cartItems.filter((i) => i.productId !== productId) })),
  clearCart: () => set({ cartItems: [], cartExternalOrderId: null, cartChannel: 'direct' }),

  paymentMethod: 'cash',
  setPaymentMethod: (m) => set({ paymentMethod: m }),

  cardPaymentState: 'idle',
  cardTransactionId: null,
  setCardPaymentState: (state, transactionId) =>
    set((prev) => ({
      cardPaymentState: state,
      cardTransactionId: transactionId !== undefined ? (transactionId ?? null) : prev.cardTransactionId,
    })),

  pendingOrders: [],
  addPendingOrder: (order) =>
    set((state) => ({ pendingOrders: [...state.pendingOrders, order] })),
  removePendingOrder: (id) =>
    set((state) => ({ pendingOrders: state.pendingOrders.filter((o) => o.id !== id) })),

  isLocked: !localStorage.getItem('kassomat_access_token'),
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),

  activeCategory: null,
  setActiveCategory: (id) => set({ activeCategory: id }),

  pluSearch: '',
  setPluSearch: (s) => set({ pluSearch: s }),

  showOrderPanel: false,
  setShowOrderPanel: (show) => set({ showOrderPanel: show }),
}));
