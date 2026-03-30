import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import type { AnalyticsData } from '@kassomat/types';
import api, { getPrintMode, getDigitalReceiptUrl, waitForRksvSignature, printReceiptById, createClosingReceipt } from '../lib/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}

interface AnalyticsResponse {
  success: true;
  data: AnalyticsData;
}

interface DailyClosingResponse {
  success: true;
  data: {
    id: string;
    date: string;
    totalRevenue: number;
    totalCash: number;
    totalCard: number;
    totalOnline: number;
    receiptCount: number;
    cancellationCount: number;
    cashCountEntered: number;
    cashDifference: number;
    summary: {
      totalRevenue: number;
      totalCash: number;
      totalCard: number;
      totalOnline: number;
      receiptCount: number;
      cancellationCount: number;
    };
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#0e1115] border border-white/5 rounded-xl p-5">
      <p className="text-white/40 text-xs font-medium uppercase tracking-wide mb-2">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-white/40 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function PaymentBar({ label, cents, total, color }: { label: string; cents: number; total: number; color: string }) {
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

function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse bg-white/5 rounded', className)} />;
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function TagesabschlussPage() {
  const queryClient = useQueryClient();
  const [cashCountEur, setCashCountEur] = useState('');
  const [notes, setNotes] = useState('');
  const [closingDone, setClosingDone] = useState(false);

  // Fetch today's analytics for the preview
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics', 'today'],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsResponse>('/analytics/today');
      return data.data;
    },
  });

  // Mutation for daily closing
  const closingMutation = useMutation({
    mutationFn: async ({ cashCount, notes }: { cashCount: number; notes?: string }) => {
      const { data } = await api.post<DailyClosingResponse>('/daily-closing', { cashCount, notes });
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  const cashCountCents = Math.round(parseFloat(cashCountEur || '0') * 100);
  const expectedCash = analytics?.revenueByPayment.cash ?? 0;
  const difference = cashCountEur ? cashCountCents - expectedCash : null;

  async function handleClose() {
    if (!cashCountEur || isNaN(parseFloat(cashCountEur))) {
      toast.error('Bitte Kassenbestand eingeben');
      return;
    }

    // Open PDF window BEFORE async call (popup blocker)
    const mode = getPrintMode();
    const pdfWindow = mode === 'pdf' ? window.open('about:blank', '_blank', 'noopener') : null;

    try {
      await closingMutation.mutateAsync({
        cashCount: cashCountCents,
        notes: notes || undefined,
      });

      toast.success('Tagesabschluss erfolgreich durchgeführt');
      setClosingDone(true);

      // Print Z-Bericht via closing receipt
      try {
        const closingReceipt = await createClosingReceipt();
        await waitForRksvSignature(closingReceipt.id);
        if (mode === 'printer') {
          await printReceiptById(closingReceipt.id);
        } else if (mode === 'pdf' && pdfWindow) {
          pdfWindow.location.href = getDigitalReceiptUrl(closingReceipt.id);
        }
      } catch {
        if (pdfWindow) pdfWindow.close();
        toast.error('Z-Bericht konnte nicht gedruckt werden');
      }
    } catch (err: unknown) {
      if (pdfWindow) pdfWindow.close();
      const message =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Tagesabschluss fehlgeschlagen')
          : 'Tagesabschluss fehlgeschlagen';
      toast.error(message);
    }
  }

  const totalVat = analytics
    ? analytics.vatBreakdown.vat0 + analytics.vatBreakdown.vat10 + analytics.vatBreakdown.vat13 + analytics.vatBreakdown.vat20
    : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white font-bold text-2xl">Tagesabschluss</h1>
        <p className="text-white/40 text-sm mt-0.5">
          {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
        </p>
      </div>

      {/* Today's summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : analytics ? (
          <>
            <StatCard label="Gesamtumsatz" value={formatEur(analytics.totalRevenue)} />
            <StatCard label="Anzahl Bons" value={analytics.receiptCount.toString()} />
            <StatCard
              label="MwSt. gesamt"
              value={formatEur(totalVat)}
              sub={`10%: ${formatEur(analytics.vatBreakdown.vat10)} | 20%: ${formatEur(analytics.vatBreakdown.vat20)}`}
            />
            <StatCard label="Ø Bonwert" value={formatEur(analytics.averageReceiptValue)} />
          </>
        ) : (
          <div className="col-span-4 text-white/30 text-sm py-8 text-center">
            Keine Daten verfügbar
          </div>
        )}
      </div>

      {/* Payment method breakdown */}
      {analytics && (
        <div className="bg-[#0e1115] border border-white/5 rounded-xl p-5 mb-6">
          <h3 className="text-white/60 text-xs font-medium uppercase tracking-wide mb-4">
            Umsatz nach Zahlungsart
          </h3>
          <div className="space-y-3">
            <PaymentBar label="Barzahlung" cents={analytics.revenueByPayment.cash} total={analytics.totalRevenue} color="#00e87a" />
            <PaymentBar label="Kartenzahlung" cents={analytics.revenueByPayment.card} total={analytics.totalRevenue} color="#3b82f6" />
            <PaymentBar label="Online" cents={analytics.revenueByPayment.online} total={analytics.totalRevenue} color="#a855f7" />
          </div>
        </div>
      )}

      {/* VAT breakdown */}
      {analytics && (
        <div className="bg-[#0e1115] border border-white/5 rounded-xl p-5 mb-6">
          <h3 className="text-white/60 text-xs font-medium uppercase tracking-wide mb-4">
            MwSt. Aufschlüsselung
          </h3>
          <div className="space-y-2">
            {[
              { label: '0% (steuerfrei)', value: analytics.vatBreakdown.vat0 },
              { label: '10% (ermäßigt)', value: analytics.vatBreakdown.vat10 },
              { label: '13% (Sonder)', value: analytics.vatBreakdown.vat13 },
              { label: '20% (normal)', value: analytics.vatBreakdown.vat20 },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-white/60 text-sm">{row.label}</span>
                <span className="text-white text-sm font-medium">{formatEur(row.value)}</span>
              </div>
            ))}
            <div className="border-t border-white/5 pt-2 mt-2 flex items-center justify-between">
              <span className="text-white/80 text-sm font-medium">Gesamt</span>
              <span className="text-white text-sm font-bold">{formatEur(totalVat)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Cash count input + notes */}
      {!closingDone && (
        <div className="bg-[#0e1115] border border-white/5 rounded-xl p-5 mb-6 space-y-5">
          <h3 className="text-white/60 text-xs font-medium uppercase tracking-wide">
            Kassenbestand eingeben
          </h3>

          <div>
            <label className="block text-white/60 text-sm mb-1.5">Gezählter Kassenbestand (EUR)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={cashCountEur}
              onChange={(e) => setCashCountEur(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-lg font-medium placeholder-white/20 focus:outline-none focus:border-[#00e87a]/50 focus:ring-1 focus:ring-[#00e87a]/30 transition-colors"
            />
          </div>

          {/* Expected vs actual */}
          {analytics && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-white/40 text-xs mb-1">Erwartet (Bar)</p>
                <p className="text-white text-sm font-medium">{formatEur(expectedCash)}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs mb-1">Gezählt</p>
                <p className="text-white text-sm font-medium">
                  {cashCountEur ? formatEur(cashCountCents) : '—'}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-xs mb-1">Kassendifferenz</p>
                <p
                  className={clsx(
                    'text-sm font-medium',
                    difference === null
                      ? 'text-white/30'
                      : difference === 0
                      ? 'text-[#00e87a]'
                      : difference > 0
                      ? 'text-yellow-400'
                      : 'text-red-400',
                  )}
                >
                  {difference === null
                    ? '—'
                    : `${difference >= 0 ? '+' : ''}${formatEur(difference)}`}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-white/40 text-xs mb-1.5">Anmerkungen (optional)</label>
            <textarea
              rows={2}
              placeholder="z.B. Kassendifferenz wegen Wechselgeld-Fehler..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00e87a]/50 focus:ring-1 focus:ring-[#00e87a]/30 transition-colors resize-none"
            />
          </div>

          {/* Execute button */}
          <button
            type="button"
            onClick={handleClose}
            disabled={closingMutation.isPending || !cashCountEur}
            className={clsx(
              'w-full py-3.5 rounded-xl font-semibold text-sm transition-all',
              closingMutation.isPending || !cashCountEur
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-[#00e87a] text-black hover:bg-[#00e87a]/90 shadow-lg shadow-[#00e87a]/20',
            )}
          >
            {closingMutation.isPending ? 'Wird ausgeführt...' : 'Tagesabschluss durchführen'}
          </button>
        </div>
      )}

      {/* Success state */}
      {closingDone && (
        <div className="bg-[#00e87a]/10 border border-[#00e87a]/20 rounded-xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#00e87a]/20 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#00e87a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-[#00e87a] font-semibold text-lg">Tagesabschluss erfolgreich</p>
          <p className="text-white/40 text-sm mt-1">
            Z-Bericht wurde erstellt und gedruckt.
          </p>
        </div>
      )}
    </div>
  );
}
