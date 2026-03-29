import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import type { AnalyticsData, Receipt } from '@kassomat/types';
import api, { cancelReceipt } from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}

function formatDate(d: string | Date): string {
  return format(new Date(d), 'dd.MM.yyyy HH:mm', { locale: de });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = 'today' | '7d' | '30d';

interface AnalyticsResponse {
  success: true;
  data: AnalyticsData;
}

interface RecentReceiptsResponse {
  success: true;
  data: {
    items: Receipt[];
    total: number;
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#0e1115] border border-white/5 rounded-xl p-5">
      <p className="text-white/40 text-xs font-medium uppercase tracking-wide mb-2">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-white/40 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function PaymentBar({
  label,
  cents,
  total,
  color,
}: {
  label: string;
  cents: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((cents / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-white/60 text-xs">{label}</span>
        <span className="text-white/80 text-xs font-medium">
          {formatEur(cents)}{' '}
          <span className="text-white/40">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    signed: { label: 'Signiert', cls: 'bg-[#00e87a]/10 text-[#00e87a]' },
    printed: { label: 'Gedruckt', cls: 'bg-blue-500/10 text-blue-400' },
    pending: { label: 'Ausstehend', cls: 'bg-yellow-500/10 text-yellow-400' },
    cancelled: { label: 'Storniert', cls: 'bg-red-500/10 text-red-400' },
    offline_pending: { label: 'Offline', cls: 'bg-orange-500/10 text-orange-400' },
  };
  const info = map[status] ?? { label: status, cls: 'bg-white/10 text-white/60' };

  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', info.cls)}>
      {info.label}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cash: { label: 'Bar', cls: 'text-white/50' },
    card: { label: 'Karte', cls: 'text-blue-400' },
    online: { label: 'Online', cls: 'text-purple-400' },
  };
  const info = map[method] ?? { label: method, cls: 'text-white/50' };
  return <span className={clsx('text-xs', info.cls)}>{info.label}</span>;
}

function StornoButton({ receiptId, onSuccess }: { receiptId: string; onSuccess: () => void }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
        'min-h-[32px] px-3 rounded-lg text-[10px] font-medium transition-all border whitespace-nowrap',
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

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx('animate-pulse bg-white/5 rounded', className)}
    />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<Range>('today');

  const analyticsEndpoint =
    range === 'today'
      ? '/analytics/today'
      : `/analytics/range?from=${format(subDays(new Date(), range === '7d' ? 7 : 30), 'yyyy-MM-dd')}&to=${format(new Date(), 'yyyy-MM-dd')}`;

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics', range],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsResponse>(analyticsEndpoint);
      return data.data;
    },
  });

  const { data: receipts, isLoading: receiptsLoading } = useQuery<Receipt[]>({
    queryKey: ['receipts-recent'],
    queryFn: async () => {
      const { data } = await api.get<RecentReceiptsResponse>('/receipts?pageSize=10');
      return data.data.items;
    },
  });

  const rangeButtons: Array<{ id: Range; label: string }> = [
    { id: 'today', label: 'Heute' },
    { id: '7d', label: 'Letzte 7 Tage' },
    { id: '30d', label: 'Letzte 30 Tage' },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-white font-bold text-2xl">Dashboard</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
        </div>

        {/* Range selector */}
        <div className="flex gap-1 bg-[#0e1115] border border-white/5 rounded-lg p-1">
          {rangeButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setRange(btn.id)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                range === btn.id
                  ? 'bg-[#00e87a]/10 text-[#00e87a]'
                  : 'text-white/50 hover:text-white/80',
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {analyticsLoading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : analyticsData ? (
          <>
            <StatCard label="Gesamtumsatz" value={formatEur(analyticsData.totalRevenue)} />
            <StatCard
              label="Anzahl Bons"
              value={analyticsData.receiptCount.toString()}
            />
            <StatCard
              label="Ø Bonwert"
              value={formatEur(analyticsData.averageReceiptValue)}
            />
            <StatCard
              label="MwSt. gesamt"
              value={formatEur(
                analyticsData.vatBreakdown.vat0 +
                  analyticsData.vatBreakdown.vat10 +
                  analyticsData.vatBreakdown.vat20,
              )}
              sub={`10%: ${formatEur(analyticsData.vatBreakdown.vat10)} | 20%: ${formatEur(analyticsData.vatBreakdown.vat20)}`}
            />
          </>
        ) : (
          <div className="col-span-4 text-white/30 text-sm py-8 text-center">
            Keine Daten verfügbar
          </div>
        )}
      </div>

      {/* Payment method breakdown */}
      {analyticsData && (
        <div className="bg-[#0e1115] border border-white/5 rounded-xl p-5 mb-6">
          <h3 className="text-white/60 text-xs font-medium uppercase tracking-wide mb-4">
            Umsatz nach Zahlungsart
          </h3>
          <div className="space-y-3">
            <PaymentBar
              label="Barzahlung"
              cents={analyticsData.revenueByPayment.cash}
              total={analyticsData.totalRevenue}
              color="#00e87a"
            />
            <PaymentBar
              label="Kartenzahlung"
              cents={analyticsData.revenueByPayment.card}
              total={analyticsData.totalRevenue}
              color="#3b82f6"
            />
            <PaymentBar
              label="Online"
              cents={analyticsData.revenueByPayment.online}
              total={analyticsData.totalRevenue}
              color="#a855f7"
            />
          </div>
        </div>
      )}

      {/* Recent receipts */}
      <div className="bg-[#0e1115] border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-white font-medium text-sm">Letzte Bons</h3>
        </div>

        {receiptsLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : receipts && receipts.length > 0 ? (
          <div className="divide-y divide-white/5">
            {receipts.map((r) => (
              <div
                key={r.id}
                className="px-5 py-3 flex items-center gap-4 hover:bg-white/2 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{r.receiptNumber}</p>
                  <p className="text-white/40 text-xs">{formatDate(r.createdAt)}</p>
                </div>
                <MethodBadge method={r.payment?.method ?? 'cash'} />
                <span className="text-white text-sm font-semibold w-24 text-right">
                  {formatEur(r.totals?.totalGross ?? 0)}
                </span>
                <StatusBadge status={r.status} />
                {(r.status === 'signed' || r.status === 'printed') && (
                  <StornoButton
                    receiptId={r.id}
                    onSuccess={() => {
                      void queryClient.invalidateQueries({ queryKey: ['receipts-recent'] });
                      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-white/30 text-sm">
            Noch keine Bons vorhanden
          </div>
        )}
      </div>
    </div>
  );
}
