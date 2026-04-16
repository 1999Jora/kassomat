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

export interface DeliveryInfo {
  name: string;
  street: string;
  city: string;
}

export interface OpenTab {
  id: string;
  label: string;
  items: CartItem[];
  channel: 'direct' | 'lieferando' | 'wix';
  externalOrderId: string | null;
  orderType: 'dine_in' | 'delivery';
  deliveryInfo: DeliveryInfo;
}

const MAX_TABS = 8;
let tabCounter = 1;

function createEmptyTab(label?: string): OpenTab {
  const id = `tab-${tabCounter++}`;
  return {
    id,
    label: label ?? `Bon ${tabCounter - 1}`,
    items: [],
    channel: 'direct',
    externalOrderId: null,
    orderType: 'dine_in',
    deliveryInfo: { name: '', street: '', city: '' },
  };
}

const emptyDelivery: DeliveryInfo = { name: '', street: '', city: '' };

/** Derive flat cart fields from tabs + activeTabId (backwards-compatible) */
function deriveCart(tabs: OpenTab[], activeTabId: string) {
  const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]!;
  return {
    cartItems: tab.items,
    cartChannel: tab.channel,
    cartExternalOrderId: tab.externalOrderId,
    orderType: tab.orderType,
    deliveryInfo: tab.deliveryInfo,
  };
}

/** Update active tab's fields, then re-derive flat cart state */
function setActiveTab(
  state: Pick<AppState, 'tabs' | 'activeTabId'>,
  updater: (tab: OpenTab) => Partial<OpenTab>,
) {
  const tabs = state.tabs.map((t) =>
    t.id === state.activeTabId ? { ...t, ...updater(t) } : t,
  );
  return { tabs, ...deriveCart(tabs, state.activeTabId) };
}

const initialTab = createEmptyTab();

interface AppState {
  // Multi-tab cart
  tabs: OpenTab[];
  activeTabId: string;
  createTab: (label?: string) => void;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  renameTab: (id: string, label: string) => void;

  // Flat cart state (derived from active tab — backwards-compatible)
  cartItems: CartItem[];
  cartChannel: 'direct' | 'lieferando' | 'wix';
  cartExternalOrderId: string | null;
  orderType: 'dine_in' | 'delivery';
  deliveryInfo: DeliveryInfo;

  setOrderType: (type: 'dine_in' | 'delivery') => void;
  setDeliveryInfo: (info: Partial<DeliveryInfo>) => void;
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

  // Mobile tab navigation
  mobileTab: 'articles' | 'cart' | 'payment';
  setMobileTab: (tab: 'articles' | 'cart' | 'payment') => void;

  // Order notification panel
  showOrderPanel: boolean;
  setShowOrderPanel: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // ── Multi-tab ─────────────────────────────────────────────────────────────
  tabs: [initialTab],
  activeTabId: initialTab.id,

  // Flat cart state (derived from initial tab)
  cartItems: initialTab.items,
  cartChannel: initialTab.channel,
  cartExternalOrderId: initialTab.externalOrderId,
  orderType: initialTab.orderType,
  deliveryInfo: initialTab.deliveryInfo,

  createTab: (label) => set((state) => {
    if (state.tabs.length >= MAX_TABS) return state;
    const tab = createEmptyTab(label);
    const tabs = [...state.tabs, tab];
    return { tabs, activeTabId: tab.id, ...deriveCart(tabs, tab.id) };
  }),

  switchTab: (id) => set((state) => {
    if (!state.tabs.some((t) => t.id === id)) return state;
    return { activeTabId: id, ...deriveCart(state.tabs, id) };
  }),

  closeTab: (id) => set((state) => {
    if (state.tabs.length <= 1) {
      // Last tab — just clear it
      const tab = { ...state.tabs[0]!, items: [], externalOrderId: null, channel: 'direct' as const, orderType: 'dine_in' as const, deliveryInfo: emptyDelivery };
      const tabs = [tab];
      return { tabs, ...deriveCart(tabs, tab.id) };
    }
    const remaining = state.tabs.filter((t) => t.id !== id);
    const closedIdx = state.tabs.findIndex((t) => t.id === id);
    const newActiveId = state.activeTabId === id
      ? remaining[Math.min(closedIdx, remaining.length - 1)]!.id
      : state.activeTabId;
    return { tabs: remaining, activeTabId: newActiveId, ...deriveCart(remaining, newActiveId) };
  }),

  renameTab: (id, label) => set((state) => ({
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, label } : t)),
  })),

  // ── Cart actions (operate on active tab) ──────────────────────────────────
  setOrderType: (type) => set((state) => setActiveTab(state, () => ({ orderType: type }))),

  setDeliveryInfo: (info) => set((state) => setActiveTab(state, (tab) => ({
    deliveryInfo: { ...tab.deliveryInfo, ...info },
  }))),

  addToCart: (item) =>
    set((state) => setActiveTab(state, (tab) => {
      const existing = tab.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          items: tab.items.map((i) =>
            i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        };
      }
      return { items: [...tab.items, { ...item, quantity: 1, discount: 0 }] };
    })),

  updateQuantity: (productId, quantity) =>
    set((state) => setActiveTab(state, (tab) => ({
      items:
        quantity <= 0
          ? tab.items.filter((i) => i.productId !== productId)
          : tab.items.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    }))),

  removeFromCart: (productId) =>
    set((state) => setActiveTab(state, (tab) => ({
      items: tab.items.filter((i) => i.productId !== productId),
    }))),

  clearCart: () =>
    set((state) => setActiveTab(state, () => ({
      items: [],
      externalOrderId: null,
      channel: 'direct' as const,
      orderType: 'dine_in' as const,
      deliveryInfo: emptyDelivery,
    }))),

  // ── Payment ───────────────────────────────────────────────────────────────
  paymentMethod: 'cash',
  setPaymentMethod: (m) => set({ paymentMethod: m }),

  cardPaymentState: 'idle',
  cardTransactionId: null,
  setCardPaymentState: (state, transactionId) =>
    set((prev) => ({
      cardPaymentState: state,
      cardTransactionId: transactionId !== undefined ? (transactionId ?? null) : prev.cardTransactionId,
    })),

  // ── Orders queue ──────────────────────────────────────────────────────────
  pendingOrders: [],
  addPendingOrder: (order) =>
    set((state) => ({ pendingOrders: [...state.pendingOrders, order] })),
  removePendingOrder: (id) =>
    set((state) => ({ pendingOrders: state.pendingOrders.filter((o) => o.id !== id) })),

  // ── UI state ──────────────────────────────────────────────────────────────
  isLocked: !localStorage.getItem('kassomat_access_token'),
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),

  activeCategory: null,
  setActiveCategory: (id) => set({ activeCategory: id }),

  pluSearch: '',
  setPluSearch: (s) => set({ pluSearch: s }),

  mobileTab: 'articles',
  setMobileTab: (tab) => set({ mobileTab: tab }),

  showOrderPanel: false,
  setShowOrderPanel: (show) => set({ showOrderPanel: show }),
}));
