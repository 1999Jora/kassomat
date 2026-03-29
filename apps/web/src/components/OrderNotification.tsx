import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatCents, formatRelative } from '../lib/formatters';
import type { IncomingOrder } from '@kassomat/types';
import { jsPDF } from 'jspdf';
import { playSuccess } from '../lib/sounds';
import { waitForRksvSignature, printReceiptById, getDigitalReceiptUrl, getPrintMode } from '../lib/api';

// ── Shared helpers ────────────────────────────────────────────────────────────

async function loadLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function makeDoc(W: number, extraLines: number) {
  // Extra Puffer für Zeilenumbrüche bei langen Artikelnamen
  const H = Math.max(150, (extraLines + 40) * 5 + 20);
  return new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' });
}

// ── 1. AUFTRAGSBON — automatisch beim Eingang (Lieferschein) ──────────────────
// Groß, fett, Fokus auf Lieferadresse & Artikel — kein Preis nötig

export async function printAuftragsbon(order: IncomingOrder): Promise<void> {
  const W = 80;
  const MARGIN = 5;
  const COL_R = W - MARGIN;

  const lines = 18 + order.items.length + (order.deliveryAddress ? 4 : 0);
  const doc = makeDoc(W, lines);
  let y = 6;

  const logoData = await loadLogoBase64();
  if (logoData) {
    doc.addImage(logoData, 'PNG', (W - 24) / 2, y, 24, 24);
    y += 27;
  }

  function ctr(text: string, size: number, bold = false) {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, W / 2, y, { align: 'center' });
    y += size * 0.45;
  }

  function line(text: string, size = 9, bold = false, indent = 0) {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, MARGIN + indent, y);
    y += size * 0.45;
  }

  function sep() {
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    const n = Math.floor((COL_R - MARGIN) / doc.getTextWidth('-'));
    doc.text('-'.repeat(n), MARGIN, y);
    y += 4;
  }

  // Header
  ctr('*** LIEFERAUFTRAG ***', 11, true);
  y += 2;
  // orderNumber ist 0 bis Railway-Migration gelaufen ist → Fallback auf Ende der UUID
  const orderNum = order.orderNumber || order.externalId.slice(-6).toUpperCase();
  ctr(`AUFTRAG #${orderNum}`, 16, true);
  y += 3;

  const dateStr = new Date(order.receivedAt).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  ctr(dateStr, 8);
  // Avoid unicode symbols — jsPDF Courier encodes them as HTML entities
  const payLabel = order.paymentMethod === 'online_paid' ? 'BEREITS BEZAHLT' : 'BAR BEI LIEFERUNG';
  ctr(payLabel, 9, true);
  y += 3;

  // Kunde
  sep();
  if (order.customer) {
    line('KUNDE:', 8, true);
    line(order.customer.name, 11, true, 2);
    if (order.customer.phone) line(`Tel: ${order.customer.phone}`, 10, true, 2);
    y += 2;
  }

  // Lieferadresse
  if (order.deliveryAddress) {
    sep();
    line('LIEFERADRESSE:', 8, true);
    line(order.deliveryAddress.street, 11, true, 2);
    line(`${order.deliveryAddress.zip} ${order.deliveryAddress.city}`, 10, false, 2);
    if (order.deliveryAddress.notes) line(`Hinweis: ${order.deliveryAddress.notes}`, 8, false, 2);
    y += 2;
  }

  // Artikel
  sep();
  line('ARTIKEL:', 8, true);
  y += 1;
  const NAME_X = MARGIN + 10;
  const NAME_MAX_W = COL_R - NAME_X; // verfügbare Breite für Artikelname
  for (const item of order.items) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.text(`${item.quantity}x`, MARGIN + 2, y);
    doc.setFont('courier', 'normal');
    doc.setFontSize(10);
    // Langen Text auf mehrere Zeilen aufteilen
    const nameLines = doc.splitTextToSize(item.name, NAME_MAX_W) as string[];
    doc.text(nameLines[0], NAME_X, y);
    for (let li = 1; li < nameLines.length; li++) {
      y += 5;
      doc.text(nameLines[li], NAME_X, y);
    }
    y += 6;
  }
  y += 2;

  // Gesamtbetrag
  sep();
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text('GESAMT:', MARGIN, y);
  doc.text(formatCents(order.totalAmount), COL_R, y, { align: 'right' });
  y += 3;

  const fileNum = order.orderNumber || order.externalId.slice(-6).toUpperCase();
  doc.save(`Auftrag_${fileNum}.pdf`);
}

// ── 2. KASSENBON — manuell beim Übergabe-Klick (mit Preisen & MwSt) ──────────

export async function printThermalReceipt(order: IncomingOrder, tenantName = 'Spätii Innsbruck'): Promise<void> {
  const W = 80;
  const MARGIN = 5;
  const PRINT_W = W - MARGIN * 2;
  const LINE_H = 5;
  const COL_R = W - MARGIN;

  const lines = 24 + order.items.length * 2 + (order.deliveryAddress ? 5 : 0);
  const doc = makeDoc(W, lines);
  let y = 6;

  const logoData = await loadLogoBase64();
  if (logoData) {
    doc.addImage(logoData, 'PNG', (W - 28) / 2, y, 28, 28);
    y += 31;
  }

  function ctr(text: string, size: number, bold = false) {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, W / 2, y, { align: 'center' });
    y += LINE_H;
  }

  function row(left: string, right: string, size = 8, bold = false) {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(left, MARGIN, y);
    doc.text(right, COL_R, y, { align: 'right' });
    y += LINE_H;
  }

  function divider(dashed = false) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    const char = dashed ? '-' : '=';
    const count = Math.floor(PRINT_W / doc.getTextWidth(char));
    doc.text(char.repeat(count), MARGIN, y);
    y += 4;
  }

  function txt(text: string, size = 8, bold = false, indent = 0) {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, MARGIN + indent, y);
    y += LINE_H;
  }

  ctr(tenantName.toUpperCase(), 10, true);
  y += 1;
  divider();

  const dateStr = new Date(order.receivedAt).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  txt(`Datum:   ${dateStr}`, 7);
  const bonNr = order.orderNumber || order.externalId.slice(-6).toUpperCase();
  txt(`Bon-Nr:  #${bonNr}`, 7);
  txt(`Zahlung: ${order.paymentMethod === 'online_paid' ? 'Online bezahlt' : 'Bar bei Lieferung'}`, 7);
  y += 1;

  if (order.customer) {
    divider(true);
    txt(order.customer.name, 8, true);
    if (order.customer.phone) txt(`Tel: ${order.customer.phone}`, 7, false);
    y += 1;
  }

  if (order.deliveryAddress) {
    divider(true);
    txt('Lieferadresse:', 7, true);
    txt(order.deliveryAddress.street, 7, false, 2);
    txt(`${order.deliveryAddress.zip} ${order.deliveryAddress.city}`, 7, false, 2);
    y += 1;
  }

  divider();
  for (const item of order.items) {
    const priceStr = formatCents(item.totalPrice);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    // Breite für Name = Gesamtbreite minus Preis-Spalte (ca. 18mm) minus Prefix "1x "
    const priceW = doc.getTextWidth(priceStr) + 2;
    const nameMaxW = PRINT_W - priceW - 6;
    const prefix = `${item.quantity}x `;
    const nameLines = doc.splitTextToSize(item.name, nameMaxW - doc.getTextWidth(prefix)) as string[];
    doc.text(prefix + nameLines[0], MARGIN, y);
    doc.text(priceStr, COL_R, y, { align: 'right' });
    for (let li = 1; li < nameLines.length; li++) {
      y += LINE_H;
      doc.text('   ' + nameLines[li], MARGIN, y);
    }
    y += LINE_H;
  }
  y += 1;
  divider();
  row('GESAMT', formatCents(order.totalAmount), 10, true);
  y += 1;
  divider(true);
  const vatAmt = Math.round(order.totalAmount * 20 / 120);
  txt(`inkl. 20% MwSt.: ${formatCents(vatAmt)}`, 6);
  y += 2;
  divider();
  ctr('Danke fur Ihre Bestellung!', 8, true);
  ctr('www.spaetii-innsbruck.at', 6);

  const bonFileNr = order.orderNumber || order.externalId.slice(-6).toUpperCase();
  doc.save(`Bon_${bonFileNr}.pdf`);
}

// ── Source + status config ────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; cls: string; icon: string }> = {
  lieferando: { label: 'Lieferando', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: '🍕' },
  wix: { label: 'Wix', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: '🛒' },
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Neu', cls: 'text-yellow-400 bg-yellow-400/10' },
  accepted: { label: 'Angenommen', cls: 'text-[#00e87a] bg-[#00e87a]/10' },
  in_progress: { label: 'In Bearbeitung', cls: 'text-blue-400 bg-blue-400/10' },
  completed: { label: 'Fertig', cls: 'text-[#6b7280] bg-white/5' },
  cancelled: { label: 'Storniert', cls: 'text-red-400 bg-red-400/10' },
};

interface Props { onClose: () => void; }

export default function OrderNotification({ onClose }: Props) {
  const { pendingOrders, removePendingOrder } = useAppStore();
  const [printing, setPrinting] = useState<string | null>(null);

  async function handlePrintBon(order: IncomingOrder) {
    setPrinting(order.id);
    try {
      const token = localStorage.getItem('kassomat_access_token');
      const apiUrl = import.meta.env['VITE_API_URL'] ?? '';
      const paymentMethod = order.paymentMethod === 'online_paid' ? 'online' : 'cash';

      // Gleicher Flow wie POS: Print-Mode lesen + PDF-Fenster VOR await öffnen
      const mode = getPrintMode();
      let pdfWindow: Window | null = null;
      if (mode === 'pdf') {
        pdfWindow = window.open('about:blank', '_blank', 'noopener');
      }

      const res = await fetch(`${apiUrl}/orders/${order.id}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payment: { method: paymentMethod, amountPaid: order.totalAmount, tip: 0 } }),
      });

      if (!res.ok) throw new Error(`Receipt creation failed: ${res.status}`);
      const body = await res.json();
      const receiptId: string = body.data.id;

      // Auf RKSV-Signierung warten, dann über Server drucken
      await waitForRksvSignature(receiptId);

      if (mode === 'printer') {
        await printReceiptById(receiptId);
      } else if (mode === 'pdf' && pdfWindow) {
        pdfWindow.location.href = getDigitalReceiptUrl(receiptId);
      }

      playSuccess();
      removePendingOrder(order.id);
    } catch (err) {
      console.error('Order receipt failed, falling back to local PDF:', err);
      // Fallback: lokaler jsPDF-Bon falls Server-Flow fehlschlägt
      await printThermalReceipt(order);
      removePendingOrder(order.id);
    } finally {
      setPrinting(null);
    }
  }

  function rejectOrder(id: string) {
    removePendingOrder(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:w-[22rem] sm:m-4 sm:mt-[72px] bg-[#0e1115] border border-white/[0.08] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[82vh] flex flex-col">
        {/* Handle (mobile) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#6b7280]">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span className="text-sm font-semibold">Eingehende Bestellungen</span>
            {pendingOrders.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#00e87a]/10 text-[#00e87a] text-[10px] font-bold border border-[#00e87a]/20">
                {pendingOrders.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[28px] min-h-[28px] w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-2.5">
          {pendingOrders.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-[#6b7280]">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="opacity-40">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <p className="text-sm">Keine offenen Bestellungen</p>
            </div>
          ) : (
            pendingOrders.map((order) => {
              const src = SOURCE_CONFIG[order.source] ?? { label: order.source, cls: 'bg-white/5 text-white/60 border-white/10', icon: '📦' };
              const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
              const payIsOnline = order.paymentMethod === 'online_paid';

              return (
                <div key={order.id} className="bg-[#080a0c] rounded-xl border border-white/[0.06] overflow-hidden">
                  {/* Order header */}
                  <div className="px-3 pt-3 pb-2">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${src.cls}`}>
                          {src.icon} {src.label}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusCfg.cls}`}>
                          {statusCfg.label}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${payIsOnline ? 'bg-[#00e87a]/10 text-[#00e87a]' : 'bg-white/5 text-white/50'}`}>
                          {payIsOnline ? 'Bereits bezahlt' : 'Bar bei Lieferung'}
                        </span>
                      </div>
                      <span className="text-base font-bold text-[#00e87a] font-mono shrink-0">
                        {formatCents(order.totalAmount)}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#6b7280] font-mono">
                      #{order.externalId} <span className="mx-1 opacity-30">·</span>
                      {formatRelative(new Date(order.receivedAt))}
                    </p>
                  </div>

                  {/* Customer + Delivery Address */}
                  {(order.customer || order.deliveryAddress) && (
                    <div className="px-3 pb-2 space-y-0.5">
                      {order.customer && (
                        <p className="text-xs text-white/60">
                          <span className="text-white/80 font-medium">{order.customer.name}</span>
                          {order.customer.phone && <span className="text-[#6b7280] ml-1.5">{order.customer.phone}</span>}
                        </p>
                      )}
                      {order.deliveryAddress && (
                        <p className="text-[11px] text-[#6b7280]">
                          📍 {order.deliveryAddress.street}, {order.deliveryAddress.zip} {order.deliveryAddress.city}
                          {order.deliveryAddress.notes && <span className="block ml-4 italic">{order.deliveryAddress.notes}</span>}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Items */}
                  <div className="px-3 pb-2 space-y-0.5 border-t border-white/[0.05] pt-2">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-start text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="text-white/70">
                            <span className="font-mono text-[#6b7280] mr-1">{item.quantity}×</span>
                            {item.name}
                          </span>
                        </div>
                        <span className="text-white/50 font-mono ml-2 shrink-0">{formatCents(item.totalPrice)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div className="px-3 pb-2 border-t border-white/[0.05] pt-2">
                      <p className="text-[10px] text-[#6b7280] italic">"{order.notes}"</p>
                    </div>
                  )}

                  {/* Actions */}
                  {order.status === 'pending' && (
                    <div className="px-3 pb-3 pt-2 border-t border-white/[0.05] flex gap-2">
                      <button
                        type="button"
                        onClick={() => rejectOrder(order.id)}
                        className="flex-none min-h-[38px] px-3 rounded-lg bg-white/[0.04] hover:bg-red-900/20 hover:text-red-400 text-white/40 text-xs font-medium transition-colors border border-white/[0.06] hover:border-red-900/30"
                      >
                        Ablehnen
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintBon(order)}
                        disabled={printing === order.id}
                        className="flex-1 min-h-[38px] rounded-lg bg-[#00e87a] hover:bg-[#00d470] active:scale-[0.99] text-black text-xs font-bold transition-all shadow-md shadow-[#00e87a]/15 disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-1.5"
                      >
                        {printing === order.id ? (
                          <>
                            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            Bon wird erstellt...
                          </>
                        ) : (
                          <>
                            🖨️ Bon drucken
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
