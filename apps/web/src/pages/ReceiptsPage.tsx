import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import type { Receipt } from '@kassomat/types';
import {
  getReceipts,
  cancelReceipt,
  getDigitalReceiptUrl,
  printReceiptById,
  getPrintMode,
} from '../lib/api';
import { formatCents, formatDate } from '../lib/formatters';

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    signed:          { label: 'Signiert',  cls: 'bg-[#00e87a]/10 text-[#00e87a]' },
    printed:         { label: 'Gedruckt', cls: 'bg-blue-500/10 text-blue-400' },
    pending:         { label: 'Ausstehend', cls: 'bg-yellow-500/10 text-yellow-400' },
    cancelled:       { label: 'STORNIERT', cls: 'bg-red-500/10 text-red-400' },
    offline_pending: { label: 'Offline',   cls: 'bg-orange-500/10 text-orange-400' },
  };
  const info = map[status] ?? { label: status, cls: 'bg-white/10 text-white/60' };
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold', info.cls)}>
      {info.label}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cash:   { label: 'Bargeld', cls: 'text-white/50' },
    card:   { label: 'Karte',   cls: 'text-blue-400' },
    online: { label: 'Online',  cls: 'text-purple-400' },
  };
  const info = map[method] ?? { label: method, cls: 'text-white/50' };
  return <span className={clsx('text-xs font-medium', info.cls)}>{info.label}</span>;
}

function StornoButton({ receiptId, onSuccess }: { receiptId: string; onSuccess: () => void }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleClick = useCallback(async () => {
    if (state === 'idle') {
      setState('confirm');
      timerRef.current = setTimeout(() => setState('idle'), 3000);
      return;
    }
    if (state === 'confirm') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState('loading');
      try {
        await cancelReceipt(receiptId);
        toast.success('Bon storniert');
        onSuccess();
        setState('idle');
      } catch {
        toast.error('Storno fehlgeschlagen');
        setState('idle');
      }
    }
  }, [state, receiptId, onSuccess]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      className={clsx(
        'min-h-[44px] px-3 rounded-lg text-xs font-medium transition-all border whitespace-nowrap',
        state === 'confirm'
          ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
          : state === 'loading'
          ? 'bg-white/[0.04] text-white/30 border-white/[0.06] cursor-wait'
          : 'bg-transparent text-red-400/50 border-red-500/15 hover:text-red-400 hover:border-red-500/30',
      )}
    >
      {state === 'loading' ? 'Storniere...' : state === 'confirm' ? 'Wirklich stornieren?' : 'Stornieren'}
    </button>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse bg-white/5 rounded', className)} />;
}

// ── Filter types ─────────────────────────────────────────────────────────────

type StatusFilter = '' | 'signed' | 'printed' | 'cancelled' | 'offline_pending';
type PaymentFilter = '' | 'cash' | 'card' | 'online';

// ── Main page ────────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  const queryParams = {
    page,
    pageSize: 20,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter && { status: statusFilter }),
    ...(paymentFilter && { paymentMethod: paymentFilter }),
    ...(dateFrom && { from: dateFrom }),
    ...(dateTo && { to: dateTo }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['receipts-list', queryParams],
    queryFn: () => getReceipts(queryParams),
    placeholderData: (prev) => prev,
  });

  const receipts = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  function handleAnzeigen(receipt: Receipt) {
    window.open(getDigitalReceiptUrl(receipt.id), '_blank', 'noopener');
  }

  async function handleDrucken(receipt: Receipt) {
    const mode = getPrintMode();
    try {
      if (mode === 'printer') {
        await printReceiptById(receipt.id);
        toast.success('Bon wird gedruckt');
      } else {
        window.open(getDigitalReceiptUrl(receipt.id), '_blank', 'noopener');
      }
    } catch {
      toast.error('Drucken fehlgeschlagen');
    }
  }

  function handleStorno() {
    void queryClient.invalidateQueries({ queryKey: ['receipts-list'] });
  }

  const statusOptions: Array<{ value: StatusFilter; label: string }> = [
    { value: '',               label: 'Alle Status' },
    { value: 'signed',         label: 'Signiert' },
    { value: 'printed',        label: 'Gedruckt' },
    { value: 'cancelled',      label: 'Storniert' },
    { value: 'offline_pending', label: 'Offline' },
  ];

  const paymentOptions: Array<{ value: PaymentFilter; label: string }> = [
    { value: '',       label: 'Alle Zahlungsarten' },
    { value: 'cash',   label: 'Bargeld' },
    { value: 'card',   label: 'Karte' },
    { value: 'online', label: 'Online' },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-white font-bold text-2xl">Rechnungen</h1>
        <p className="text-white/40 text-sm mt-0.5">
          Alle Bons durchsuchen und verwalten
        </p>
      </div>

      {/* Search + Filters */}
      <div className="bg-[#0e1115] border border-white/5 rounded-xl p-4 mb-4 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bon-Nr. suchen (z.B. 2026-000086)..."
            className="w-full min-h-[44px] pl-10 pr-4 bg-[#080a0c] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#00e87a]/40 transition-colors"
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
            className="min-h-[44px] px-3 bg-[#080a0c] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-[#00e87a]/40 transition-colors appearance-none cursor-pointer"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => { setPaymentFilter(e.target.value as PaymentFilter); setPage(1); }}
            className="min-h-[44px] px-3 bg-[#080a0c] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-[#00e87a]/40 transition-colors appearance-none cursor-pointer"
          >
            {paymentOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            placeholder="Von"
            className="min-h-[44px] px-3 bg-[#080a0c] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-[#00e87a]/40 transition-colors"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            placeholder="Bis"
            className="min-h-[44px] px-3 bg-[#080a0c] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-[#00e87a]/40 transition-colors"
          />

          {(statusFilter || paymentFilter || dateFrom || dateTo || search) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setPaymentFilter('');
                setDateFrom('');
                setDateTo('');
                setPage(1);
              }}
              className="min-h-[44px] px-4 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/50 text-sm hover:text-white/80 hover:border-white/15 transition-colors"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-white/40 text-xs">
          {total} {total === 1 ? 'Bon' : 'Bons'} gefunden
        </p>
      </div>

      {/* Receipt list */}
      <div className="bg-[#0e1115] border border-white/5 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="hidden lg:grid grid-cols-[minmax(140px,1fr)_minmax(130px,1fr)_minmax(80px,auto)_minmax(90px,auto)_minmax(90px,auto)_minmax(80px,auto)_minmax(240px,auto)] gap-2 px-5 py-3 border-b border-white/5 text-white/40 text-xs font-medium uppercase tracking-wide">
          <span>Bon-Nr.</span>
          <span>Datum & Uhrzeit</span>
          <span>Betrag</span>
          <span>Zahlungsart</span>
          <span>Status</span>
          <span>Typ</span>
          <span className="text-right">Aktionen</span>
        </div>

        {isLoading && !data ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : receipts.length > 0 ? (
          <div className="divide-y divide-white/5">
            {receipts.map((r) => {
              const isCancelled = r.status === 'cancelled';
              return (
                <div
                  key={r.id}
                  className={clsx(
                    'px-5 py-3 hover:bg-white/[0.02] transition-colors',
                    'lg:grid lg:grid-cols-[minmax(140px,1fr)_minmax(130px,1fr)_minmax(80px,auto)_minmax(90px,auto)_minmax(90px,auto)_minmax(80px,auto)_minmax(240px,auto)] lg:gap-2 lg:items-center',
                    'flex flex-col gap-2',
                    isCancelled && 'opacity-60',
                  )}
                >
                  {/* Bon-Nr. */}
                  <div>
                    <p className={clsx('text-white text-sm font-medium', isCancelled && 'line-through')}>
                      {r.receiptNumber}
                    </p>
                    <p className="text-white/30 text-xs lg:hidden">
                      {formatDate(new Date(r.createdAt))}
                    </p>
                  </div>

                  {/* Datum */}
                  <p className="text-white/60 text-xs hidden lg:block">
                    {formatDate(new Date(r.createdAt))}
                  </p>

                  {/* Betrag */}
                  <p className={clsx('text-white text-sm font-semibold', isCancelled && 'line-through')}>
                    {formatCents(r.totals?.totalGross ?? 0)}
                  </p>

                  {/* Zahlungsart */}
                  <div>
                    <MethodBadge method={r.payment?.method ?? 'cash'} />
                  </div>

                  {/* Status */}
                  <div>
                    <StatusBadge status={r.status} />
                  </div>

                  {/* Typ */}
                  <p className="text-white/40 text-xs capitalize">
                    {r.type === 'sale' ? 'Verkauf' : r.type === 'cancellation' ? 'Storno' : r.type === 'training' ? 'Training' : r.type === 'null_receipt' ? 'Nullbeleg' : r.type === 'closing_receipt' ? 'Schlussbeleg' : r.type}
                  </p>

                  {/* Aktionen */}
                  <div className="flex items-center gap-2 lg:justify-end flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleAnzeigen(r)}
                      className="min-h-[44px] px-3 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:border-white/15 transition-all whitespace-nowrap"
                    >
                      Anzeigen
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDrucken(r)}
                      className="min-h-[44px] px-3 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:border-white/15 transition-all whitespace-nowrap"
                    >
                      Drucken
                    </button>
                    {(r.status === 'signed' || r.status === 'printed') && (
                      <StornoButton receiptId={r.id} onSuccess={handleStorno} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center text-white/30 text-sm">
            Keine Bons gefunden
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="min-h-[44px] px-4 rounded-lg text-sm font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:border-white/15 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Zurück
          </button>
          <span className="text-white/40 text-sm px-3">
            Seite {page} von {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="min-h-[44px] px-4 rounded-lg text-sm font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:border-white/15 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
