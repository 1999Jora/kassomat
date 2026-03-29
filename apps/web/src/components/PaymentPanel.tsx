import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCents } from '../lib/formatters';
import NumPad from './NumPad';
import api, { createReceipt, cancelReceipt, printReceiptById, getDigitalReceiptUrl, getPrintMode, waitForRksvSignature } from '../lib/api';
import { printLieferbon } from '../lib/print-lieferbon';
import type { Receipt } from '@kassomat/types';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'BAR', icon: '💵' },
  { id: 'card', label: 'KARTE', icon: '💳' },
  { id: 'online', label: 'ONLINE', icon: '🌐' },
] as const;

const DENOMINATIONS = [500, 1000, 2000, 5000, 10000]; // cents

const CARD_POLL_INTERVAL_MS = 3000;
const CARD_TIMEOUT_MS = 120_000;

// ─── Card waiting screen ──────────────────────────────────────────────────────

function CardWaitingScreen({
  amount,
  onCancel,
}: {
  amount: number;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-6 bg-[#080a0c] px-4">
      {/* Animated terminal icon */}
      <div className="relative w-24 h-24 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-[#00e87a]/20 animate-ping" />
        <div className="w-20 h-20 rounded-full bg-[#00e87a]/10 border border-[#00e87a]/30 flex items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="1.5">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
            <line x1="6" y1="15" x2="10" y2="15" />
          </svg>
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="text-white font-semibold text-base">Bitte am Terminal zahlen...</p>
        <p className="text-[#6b7280] text-sm">Warte auf Bestätigung vom Terminal</p>
      </div>

      <div className="bg-[#0e1115] rounded-xl border border-white/[0.06] px-8 py-4 text-center">
        <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">Betrag</p>
        <p className="text-3xl font-bold text-[#00e87a] font-mono">{formatCents(amount)}</p>
      </div>

      {/* Spinner */}
      <div className="flex items-center gap-2 text-[#6b7280] text-xs">
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Warte auf Terminal-Antwort...
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mt-2 text-xs text-[#6b7280] hover:text-red-400 transition-colors underline underline-offset-2"
      >
        Abbrechen
      </button>
    </div>
  );
}

// ─── Card declined screen ─────────────────────────────────────────────────────

function CardDeclinedScreen({
  onRetry,
  onSwitchToCash,
}: {
  onRetry: () => void;
  onSwitchToCash: () => void;
}) {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-5 bg-[#080a0c] px-4">
      <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>

      <div className="text-center">
        <p className="text-red-400 font-bold text-lg">Zahlung abgelehnt</p>
        <p className="text-[#6b7280] text-xs mt-1">Die Kartenzahlung wurde nicht autorisiert</p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[220px]">
        <button
          type="button"
          onClick={onRetry}
          className="w-full min-h-[44px] rounded-xl font-semibold text-sm bg-[#00e87a] text-black hover:bg-[#00d470] transition-colors"
        >
          Erneut versuchen
        </button>
        <button
          type="button"
          onClick={onSwitchToCash}
          className="w-full min-h-[44px] rounded-xl font-medium text-sm bg-white/[0.06] border border-white/[0.08] text-white hover:bg-white/10 transition-colors"
        >
          Mit Bar zahlen
        </button>
      </div>
    </div>
  );
}

// ─── Card timeout screen ──────────────────────────────────────────────────────

function CardTimeoutScreen({
  onRetry,
  onSwitchToCash,
}: {
  onRetry: () => void;
  onSwitchToCash: () => void;
}) {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-5 bg-[#080a0c] px-4">
      <div className="w-20 h-20 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div className="text-center">
        <p className="text-yellow-400 font-bold text-lg">Zeitüberschreitung</p>
        <p className="text-[#6b7280] text-xs mt-1">Keine Antwort vom Terminal nach 2 Minuten</p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[220px]">
        <button
          type="button"
          onClick={onRetry}
          className="w-full min-h-[44px] rounded-xl font-semibold text-sm bg-[#00e87a] text-black hover:bg-[#00d470] transition-colors"
        >
          Erneut versuchen
        </button>
        <button
          type="button"
          onClick={onSwitchToCash}
          className="w-full min-h-[44px] rounded-xl font-medium text-sm bg-white/[0.06] border border-white/[0.08] text-white hover:bg-white/10 transition-colors"
        >
          Mit Bar zahlen
        </button>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  change,
  signed,
  onStorno,
  stornoState,
}: {
  change: number;
  signed: boolean;
  onStorno: () => void;
  stornoState: 'idle' | 'confirm' | 'loading' | 'done';
}) {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 bg-[#080a0c]">
      <div className="w-20 h-20 rounded-full bg-[#00e87a]/10 border border-[#00e87a]/20 flex items-center justify-center">
        {signed ? (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="#00e87a" strokeWidth="3" />
            <path className="opacity-80" fill="#00e87a" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>
      <div className="text-center">
        <p className="text-[#00e87a] font-bold text-lg">Bon erstellt</p>
        <p className="text-[#6b7280] text-xs mt-1">
          {signed ? 'RKSV-Signatur abgeschlossen ✓' : 'RKSV-Signatur läuft...'}
        </p>
      </div>
      {change > 0 && (
        <div className="bg-[#0e1115] rounded-xl border border-white/[0.06] px-6 py-3 text-center">
          <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-0.5">Wechselgeld</p>
          <p className="text-2xl font-bold text-[#00e87a] font-mono">{formatCents(change)}</p>
        </div>
      )}
      {/* Storno button — only when signed and not already cancelled */}
      {signed && stornoState !== 'done' && (
        <button
          type="button"
          onClick={onStorno}
          disabled={stornoState === 'loading'}
          className={`mt-2 min-h-[44px] px-5 rounded-xl text-xs font-medium transition-all border ${
            stornoState === 'confirm'
              ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
              : stornoState === 'loading'
              ? 'bg-white/[0.04] text-white/30 border-white/[0.06] cursor-wait'
              : 'bg-transparent text-red-400/60 border-red-500/20 hover:text-red-400 hover:border-red-500/40'
          }`}
        >
          {stornoState === 'loading'
            ? 'Storniere...'
            : stornoState === 'confirm'
            ? 'Wirklich stornieren?'
            : 'Letzten Bon stornieren'}
        </button>
      )}
      {stornoState === 'done' && (
        <p className="mt-2 text-red-400 text-xs font-medium">Bon storniert</p>
      )}
    </div>
  );
}

// ─── Main PaymentPanel ────────────────────────────────────────────────────────

export default function PaymentPanel() {
  const {
    cartItems,
    paymentMethod,
    setPaymentMethod,
    clearCart,
    cardPaymentState,
    setCardPaymentState,
    setMobileTab,
    orderType,
    deliveryInfo,
  } = useAppStore();
  const queryClient = useQueryClient();

  const [cashInput, setCashInput] = useState('');
  const [billCounts, setBillCounts] = useState<Record<number, number>>({});
  const [showNumPad, setShowNumPad] = useState(false);
  const [tip, setTip] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [signed, setSigned] = useState(false);
  const [change, setChange] = useState(0);

  // References for card payment polling / timeout
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Keep a ref to transactionId to use inside closures
  const transactionIdRef = useRef<string | null>(null);
  // Synchronous guard against double-clicks (refs update immediately, unlike state)
  const isSubmittingRef = useRef(false);
  // Track the last created receipt for quick storno
  const lastReceiptIdRef = useRef<string | null>(null);
  const [stornoState, setStornoState] = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle');
  const stornoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalGross = cartItems.reduce((s, i) => s + i.price * i.quantity - i.discount, 0);
  const totalWithTip = totalGross + tip;

  // Cash paid: from bill accumulator OR manual numpad input
  const billTotal = DENOMINATIONS.reduce((sum, d) => sum + d * (billCounts[d] ?? 0), 0);
  const numpadAmount = cashInput
    ? Math.round(parseFloat(cashInput.replace(',', '.')) * 100)
    : 0;
  const cashPaid = billTotal > 0 ? billTotal : numpadAmount;
  const cashChange =
    paymentMethod === 'cash' && cashPaid > 0
      ? Math.max(0, cashPaid - totalWithTip)
      : 0;
  const isUnderpaid =
    paymentMethod === 'cash' && (cashInput.length > 0 || billTotal > 0) && cashPaid < totalWithTip;

  // ── Cleanup helpers ──────────────────────────────────────────────────────────

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  function stopTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function disconnectSocket() {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }

  function stopCardMonitoring() {
    stopPolling();
    stopTimeout();
    disconnectSocket();
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCardMonitoring();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pending card payment info (stored when terminal is initiated, used on confirm) ──
  const cardPaymentInfoRef = useRef<{
    items: { productId: string; quantity: number; unitPrice: number; vatRate: 0 | 10 | 13 | 20; discount: number }[];
    totalWithTip: number;
    tip: number;
  } | null>(null);

  // ── Card payment confirmed / declined handlers ────────────────────────────

  function handleCardConfirmed() {
    stopCardMonitoring();
    setCardPaymentState('confirmed');

    // NOW create the receipt — only after terminal approved
    const info = cardPaymentInfoRef.current;
    if (!info) {
      setCardPaymentState('idle', null);
      setProcessing(false);
      isSubmittingRef.current = false;
      return;
    }

    (async () => {
      try {
        const receipt: Receipt = await createReceipt({
          items: info.items,
          payment: {
            method: 'card',
            amountPaid: info.totalWithTip,
            change: 0,
            tip: info.tip,
          },
          channel: 'direct',
        });

        lastReceiptIdRef.current = receipt.id;
        setStornoState('idle');
        void queryClient.invalidateQueries({ queryKey: ['receipts-recent'] });
        void queryClient.invalidateQueries({ queryKey: ['analytics'] });
        setDone(true);
        setCardPaymentState('idle', null);
        cardPaymentInfoRef.current = null;
        void waitAndPrint(receipt.id);
      } catch {
        toast.error('Bon konnte nicht erstellt werden. Bitte manuell prüfen.');
        setCardPaymentState('idle', null);
        setProcessing(false);
        isSubmittingRef.current = false;
        cardPaymentInfoRef.current = null;
      }
    })();
  }

  function handleCardDeclined() {
    stopCardMonitoring();
    setCardPaymentState('declined');
    setProcessing(false);
    isSubmittingRef.current = false;
    cardPaymentInfoRef.current = null;
    toast.error('Karte abgelehnt.');
  }

  function handleCardTimeout() {
    stopCardMonitoring();
    setCardPaymentState('timeout');
    setProcessing(false);
    isSubmittingRef.current = false;
    cardPaymentInfoRef.current = null;
    toast.error('Kartenterminal hat nicht reagiert.');
  }

  // ── Start card payment monitoring (socket + poll fallback) ────────────────

  function startCardMonitoring(txId: string) {
    transactionIdRef.current = txId;

    // 1. Try Socket.io first
    const token = localStorage.getItem('kassomat_access_token');
    const apiUrl = import.meta.env.VITE_API_URL as string | undefined ?? 'http://localhost:3001';

    if (token) {
      const socket = io(apiUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: false,
      });
      socketRef.current = socket;

      socket.on('payment:confirmed', (data: { transactionId?: string }) => {
        if (!data.transactionId || data.transactionId === transactionIdRef.current) {
          handleCardConfirmed();
        }
      });

      socket.on('payment:declined', (data: { transactionId?: string }) => {
        if (!data.transactionId || data.transactionId === transactionIdRef.current) {
          handleCardDeclined();
        }
      });

      socket.on('connect_error', () => {
        // Socket failed — rely on polling only
        disconnectSocket();
      });
    }

    // 2. Polling fallback — runs regardless of socket status
    pollIntervalRef.current = setInterval(async () => {
      const currentTxId = transactionIdRef.current;
      if (!currentTxId) return;

      try {
        const { data } = await api.get<{
          success: boolean;
          data: { status: 'pending' | 'approved' | 'declined' | 'cancelled' };
        }>(`/payments/card/${encodeURIComponent(currentTxId)}/status`);

        const status = data.data.status;
        if (status === 'approved') {
          handleCardConfirmed();
        } else if (status === 'declined' || status === 'cancelled') {
          handleCardDeclined();
        }
      } catch {
        // Swallow polling errors — rely on timeout
      }
    }, CARD_POLL_INTERVAL_MS);

    // 3. Timeout fallback
    timeoutRef.current = setTimeout(() => {
      handleCardTimeout();
    }, CARD_TIMEOUT_MS);
  }

  // ── Quick storno for last receipt ──────────────────────────────────────────────

  function handleStorno() {
    if (stornoState === 'idle') {
      setStornoState('confirm');
      // Auto-reset after 3 seconds
      stornoTimerRef.current = setTimeout(() => setStornoState('idle'), 3000);
      return;
    }
    if (stornoState === 'confirm') {
      if (stornoTimerRef.current) clearTimeout(stornoTimerRef.current);
      const receiptId = lastReceiptIdRef.current;
      if (!receiptId) return;
      setStornoState('loading');
      cancelReceipt(receiptId)
        .then(() => {
          setStornoState('done');
          toast.success('Bon storniert');
          void queryClient.invalidateQueries({ queryKey: ['receipts-recent'] });
          void queryClient.invalidateQueries({ queryKey: ['analytics'] });
        })
        .catch(() => {
          toast.error('Storno fehlgeschlagen');
          setStornoState('idle');
        });
    }
  }

  // ── Wait for RKSV, then print ─────────────────────────────────────────────────

  async function waitAndPrint(receiptId: string) {
    // Lieferbon-Daten vor clearCart sichern
    const isDelivery = orderType === 'delivery';
    const deliveryCopy = isDelivery ? { ...deliveryInfo } : null;
    const itemsCopy = isDelivery ? [...cartItems] : null;

    // Wait for RKSV signature (shows spinner in SuccessScreen)
    await waitForRksvSignature(receiptId);
    setSigned(true);

    const mode = getPrintMode();
    if (mode === 'printer') {
      try {
        await printReceiptById(receiptId);
      } catch {
        // Print errors are non-fatal
      }
    } else if (mode === 'pdf') {
      // Direkt nach Signierung öffnen — kein about:blank mehr
      window.open(getDigitalReceiptUrl(receiptId), '_blank', 'noopener');
    }

    // Bei Lieferung: zusätzlich Lieferbon drucken (kein RKSV, "Keine Rechnung")
    if (isDelivery && deliveryCopy && itemsCopy) {
      void printLieferbon(itemsCopy, deliveryCopy);
    }

    // After print/pdf, clear cart after short delay
    setTimeout(() => {
      clearCart();
      setCashInput('');
      setBillCounts({});
      setShowNumPad(false);
      setTip(0);
      setDone(false);
      setSigned(false);
      setProcessing(false);
      isSubmittingRef.current = false;
      setStornoState('idle');
      setMobileTab('articles');
    }, 1500);
  }

  // ── Tip ──────────────────────────────────────────────────────────────────────

  function addTip(pct: number) {
    setTip(Math.round(totalGross * pct / 100));
  }

  // ── Receipt creation ─────────────────────────────────────────────────────────

  async function handleCreateReceipt() {
    if (cartItems.length === 0) return;
    // Synchronous double-click guard — ref updates immediately unlike state
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setProcessing(true);

    if (paymentMethod === 'card') {
      // ── Card flow: initiate terminal FIRST, receipt only on confirmation ──
      try {
        // Save payment info for receipt creation after terminal confirms
        cardPaymentInfoRef.current = {
          items: cartItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.price,
            vatRate: i.vatRate,
            discount: i.discount,
          })),
          totalWithTip,
          tip,
        };

        // Step 1: Initiate the terminal payment (no receipt yet)
        const { data: initiateData } = await api.post<{
          success: boolean;
          data: { transactionId: string; status: 'pending' };
        }>('/payments/card/initiate', {
          amount: totalWithTip,
          currency: 'EUR',
        });

        const txId = initiateData.data.transactionId;
        setCardPaymentState('waiting', txId);

        // Step 2: Start monitoring — receipt will be created in handleCardConfirmed
        startCardMonitoring(txId);
      } catch {
        toast.error('Zahlung fehlgeschlagen. Bitte erneut versuchen.');
        setProcessing(false);
        setCardPaymentState('idle', null);
        cardPaymentInfoRef.current = null;
        isSubmittingRef.current = false;
      }
    } else {
      // ── Cash / Online flow ─────────────────────────────────────────────────
      try {
        const receipt = await createReceipt({
          items: cartItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.price,
            vatRate: i.vatRate,
            discount: i.discount,
          })),
          payment: {
            method: paymentMethod,
            amountPaid: paymentMethod === 'cash' ? cashPaid || totalWithTip : totalWithTip,
            change: cashChange,
            tip,
          },
          channel: 'direct',
        });

        lastReceiptIdRef.current = receipt.id;
        setStornoState('idle');
        void queryClient.invalidateQueries({ queryKey: ['receipts-recent'] });
        void queryClient.invalidateQueries({ queryKey: ['analytics'] });
        setChange(cashChange);
        setDone(true);
        void waitAndPrint(receipt.id);
      } catch {
        toast.error('Zahlung fehlgeschlagen. Bitte erneut versuchen.');
        setProcessing(false);
        isSubmittingRef.current = false;
      }
    }
  }

  // ── Card state: waiting ───────────────────────────────────────────────────

  if (cardPaymentState === 'waiting') {
    return (
      <CardWaitingScreen
        amount={totalWithTip}
        onCancel={() => {
          stopCardMonitoring();
          setCardPaymentState('idle', null);
          setProcessing(false);
        }}
      />
    );
  }

  // ── Card state: declined ──────────────────────────────────────────────────

  if (cardPaymentState === 'declined') {
    return (
      <CardDeclinedScreen
        onRetry={() => {
          setCardPaymentState('idle', null);
          setProcessing(false);
        }}
        onSwitchToCash={() => {
          setCardPaymentState('idle', null);
          setPaymentMethod('cash');
          setProcessing(false);
        }}
      />
    );
  }

  // ── Card state: timeout ───────────────────────────────────────────────────

  if (cardPaymentState === 'timeout') {
    return (
      <CardTimeoutScreen
        onRetry={() => {
          setCardPaymentState('idle', null);
          setProcessing(false);
        }}
        onSwitchToCash={() => {
          setCardPaymentState('idle', null);
          setPaymentMethod('cash');
          setProcessing(false);
        }}
      />
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (done) {
    return <SuccessScreen change={change} signed={signed} onStorno={handleStorno} stornoState={stornoState} />;
  }

  // ── Main panel ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-none">
      {/* Payment method selector */}
      <div className="px-3 pt-3 pb-2.5 border-b border-white/[0.06] shrink-0">
        <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-2">Zahlungsart</p>
        <div className="grid grid-cols-3 gap-1.5">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setPaymentMethod(m.id)}
              className={`min-h-[52px] rounded-xl text-xs font-medium transition-all duration-100 border flex flex-col items-center justify-center gap-1 ${
                paymentMethod === m.id
                  ? 'bg-[#00e87a] text-black border-[#00e87a] shadow-md shadow-[#00e87a]/20'
                  : 'bg-white/[0.04] text-[#9ca3af] border-white/[0.06] hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="text-base leading-none">{m.icon}</span>
              <span className="leading-none font-bold">{m.label}</span>
            </button>
          ))}
        </div>
        {paymentMethod === 'online' && (
          <p className="mt-2 text-[10px] text-[#6b7280] flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            RKSV-befreit · §131b BAO
          </p>
        )}
        {paymentMethod === 'card' && (
          <p className="mt-2 text-[10px] text-[#6b7280] flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="2.5">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            myPOS Terminal
          </p>
        )}
      </div>

      {/* Cash denomination accumulator + numpad */}
      {paymentMethod === 'cash' && (
        <div className="px-3 py-2.5 border-b border-white/[0.06] shrink-0">
          {/* Display */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-[#6b7280] uppercase tracking-wider">Erhaltener Betrag</p>
            {(billTotal > 0 || cashInput.length > 0) && (
              <button
                type="button"
                onClick={() => { setBillCounts({}); setCashInput(''); setShowNumPad(false); }}
                className="text-[10px] text-[#6b7280] hover:text-red-400 transition-colors"
              >
                Zurücksetzen
              </button>
            )}
          </div>

          <div
            className={`bg-white/[0.04] border rounded-xl px-3 py-2 mb-2.5 flex items-center justify-between transition-colors ${
              isUnderpaid ? 'border-red-500/40' : 'border-white/[0.08]'
            }`}
          >
            <span className="text-[10px] text-[#6b7280]">Eingabe</span>
            <span className="text-lg font-mono font-medium text-white">
              {cashPaid > 0 ? formatCents(cashPaid) : '0,00 €'}
            </span>
          </div>

          {/* Denomination buttons */}
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {DENOMINATIONS.map((amt) => {
              const count = billCounts[amt] ?? 0;
              const isActive = count > 0;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setBillCounts((prev) => ({ ...prev, [amt]: (prev[amt] ?? 0) + 1 }));
                    // Clear numpad if user switches to bills
                    if (cashInput) setCashInput('');
                  }}
                  className={`relative min-h-[56px] rounded-xl text-sm font-bold transition-all duration-100 border active:scale-[0.97] ${
                    isActive
                      ? 'bg-[#00e87a]/15 text-[#00e87a] border-[#00e87a]/30'
                      : 'bg-white/[0.05] text-[#9ca3af] border-white/[0.06] hover:bg-white/10'
                  }`}
                >
                  {formatCents(amt)}
                  {isActive && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#00e87a] text-black text-[10px] font-bold flex items-center justify-center">
                      x{count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Passend button */}
          <button
            type="button"
            onClick={() => {
              if (totalWithTip > 0) {
                setBillCounts({});
                setCashInput((totalWithTip / 100).toFixed(2).replace('.', ','));
              }
            }}
            disabled={totalWithTip === 0}
            className="w-full min-h-[40px] rounded-lg text-xs font-medium transition-all border bg-white/[0.04] text-[#9ca3af] border-white/[0.06] hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed mb-2"
          >
            Passend ({formatCents(totalWithTip)})
          </button>

          {/* NumPad toggle */}
          <button
            type="button"
            onClick={() => setShowNumPad(!showNumPad)}
            className="text-[10px] text-[#6b7280] hover:text-white transition-colors mb-1.5 flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="4" height="4" />
              <rect x="10" y="4" width="4" height="4" />
              <rect x="16" y="4" width="4" height="4" />
              <rect x="4" y="10" width="4" height="4" />
              <rect x="10" y="10" width="4" height="4" />
              <rect x="16" y="10" width="4" height="4" />
            </svg>
            {showNumPad ? 'Tastatur ausblenden' : 'Betrag eingeben'}
          </button>

          {showNumPad && (
            <div className="mb-1">
              <NumPad
                value={cashInput}
                onChange={(v) => {
                  setCashInput(v);
                  // Clear bills if user switches to numpad
                  if (billTotal > 0) setBillCounts({});
                }}
                maxLength={8}
              />
            </div>
          )}

          {/* Change display */}
          {cashPaid > 0 && (
            <div
              className={`mt-2 flex justify-between items-center px-3 py-2 rounded-lg border ${
                isUnderpaid
                  ? 'bg-red-900/20 border-red-500/20'
                  : 'bg-[#00e87a]/5 border-[#00e87a]/15'
              }`}
            >
              <span className="text-xs text-[#6b7280]">
                {isUnderpaid ? 'Fehlbetrag' : 'Wechselgeld'}
              </span>
              <span
                className={`text-sm font-bold font-mono ${
                  isUnderpaid ? 'text-red-400' : 'text-[#00e87a]'
                }`}
              >
                {isUnderpaid
                  ? formatCents(totalWithTip - cashPaid)
                  : formatCents(cashChange)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tip section */}
      <div className="px-3 py-2.5 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-[#6b7280] uppercase tracking-wider">Trinkgeld</p>
          {tip > 0 && (
            <button
              type="button"
              onClick={() => setTip(0)}
              className="text-[10px] text-[#6b7280] hover:text-red-400 transition-colors"
            >
              Entfernen
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {[5, 10, 15].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => addTip(pct)}
              disabled={cartItems.length === 0}
              className={`flex-1 min-h-[48px] rounded-lg text-[10px] font-medium transition-all border ${
                tip === Math.round(totalGross * pct / 100) && tip > 0
                  ? 'bg-[#00e87a]/10 text-[#00e87a] border-[#00e87a]/25'
                  : 'bg-white/[0.04] text-[#9ca3af] border-white/[0.06] hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            >
              +{pct}%
            </button>
          ))}
        </div>
        {tip > 0 && (
          <div className="mt-1.5 flex justify-between text-xs">
            <span className="text-[#6b7280]">Trinkgeld</span>
            <span className="text-[#00e87a] font-mono">+{formatCents(tip)}</span>
          </div>
        )}
      </div>

      {/* Order summary + CTA */}
      <div className="px-3 py-3 mt-auto shrink-0">
        {cartItems.length > 0 && (
          <div className="space-y-1 mb-3 px-1">
            <div className="flex justify-between text-xs text-[#6b7280]">
              <span>Artikel</span>
              <span className="font-mono">{formatCents(totalGross)}</span>
            </div>
            {tip > 0 && (
              <div className="flex justify-between text-xs text-[#6b7280]">
                <span>Trinkgeld</span>
                <span className="font-mono text-[#00e87a]">+{formatCents(tip)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold border-t border-white/[0.06] pt-1.5">
              <span>Gesamt</span>
              <span className="text-[#00e87a] font-mono">{formatCents(totalWithTip)}</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleCreateReceipt}
          disabled={
            cartItems.length === 0 ||
            processing ||
            (paymentMethod === 'cash' && cashInput.length > 0 && isUnderpaid)
          }
          className={`w-full min-h-[56px] rounded-xl font-bold text-sm transition-all duration-150 flex items-center justify-center gap-2 ${
            cartItems.length === 0
              ? 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.05]'
              : processing
              ? 'bg-[#00e87a]/70 text-black cursor-wait'
              : isUnderpaid
              ? 'bg-white/[0.04] text-white/30 cursor-not-allowed border border-white/[0.05]'
              : 'bg-[#00e87a] hover:bg-[#00d470] active:scale-[0.99] text-black shadow-lg shadow-[#00e87a]/20'
          }`}
        >
          {processing ? (
            <>
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Verarbeite...
            </>
          ) : cartItems.length === 0 ? (
            'Bon erstellen'
          ) : paymentMethod === 'card' ? (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              Terminal — {formatCents(totalWithTip)}
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Bon — {formatCents(totalWithTip)}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
