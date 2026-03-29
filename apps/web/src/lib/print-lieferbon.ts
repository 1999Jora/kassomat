import { jsPDF } from 'jspdf';
import { formatCents } from './formatters';
import type { CartItem } from '../store/useAppStore';
import type { DeliveryInfo } from '../store/useAppStore';

/** Load saved Lieferbon config from localStorage */
function getLieferbonConfig() {
  try {
    const raw = localStorage.getItem('kassomat_lieferbon_config');
    if (raw) return JSON.parse(raw) as Record<string, unknown>;
  } catch { /* ignore */ }
  return null;
}

/**
 * Lieferbon für POS-Lieferungen.
 * Kein RKSV QR-Code, kein Logo, "KEINE RECHNUNG" oben, mit Lieferadresse.
 */
export async function printLieferbon(
  items: CartItem[],
  delivery: DeliveryInfo,
  tenantName = 'Kassomat',
): Promise<void> {
  const cfg = getLieferbonConfig();
  const title = (cfg?.title as string) ?? 'LIEFERBON';
  const showTenant = (cfg?.showTenant as boolean) ?? true;
  const showAddr = (cfg?.showAddress as boolean) ?? true;
  const showPrices = (cfg?.showPrices as boolean) ?? true;
  const W = 80;
  const MARGIN = 5;
  const PRINT_W = W - MARGIN * 2;
  const COL_R = W - MARGIN;

  // Dynamische Höhe berechnen
  const lineCount = 20 + items.length * 2 + (delivery.name ? 5 : 0);
  const H = Math.max(100, lineCount * 4.5 + 20);
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' });
  let y = 8;

  // Zeilenhöhe passend zur Schriftgröße
  function lineH(size: number) {
    return size * 0.45;
  }

  function ctr(text: string, size: number, bold = false) {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, W / 2, y, { align: 'center' });
    y += lineH(size);
  }

  function row(left: string, right: string, size = 8, bold = false) {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(left, MARGIN, y);
    doc.text(right, COL_R, y, { align: 'right' });
    y += lineH(size);
  }

  function divider(dashed = false) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    const char = dashed ? '-' : '=';
    const count = Math.floor(PRINT_W / doc.getTextWidth(char));
    doc.text(char.repeat(count), MARGIN, y);
    y += 3.5;
  }

  function txt(text: string, size = 8, bold = false, indent = 0) {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, MARGIN + indent, y);
    y += lineH(size);
  }

  // ── Header ──
  ctr('*** KEINE RECHNUNG ***', 10, true);
  y += 1;
  ctr(title, 12, true);
  y += 1;
  if (showTenant) ctr(tenantName.toUpperCase(), 8, true);
  y += 2;
  divider();

  // Datum
  const dateStr = new Date().toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  txt(`Datum: ${dateStr}`, 7);
  y += 1;

  // Lieferadresse
  if (showAddr && (delivery.name || delivery.street || delivery.city)) {
    divider(true);
    txt('LIEFERADRESSE:', 7, true);
    if (delivery.name) txt(delivery.name, 9, true, 2);
    if (delivery.street) txt(delivery.street, 8, false, 2);
    if (delivery.city) txt(delivery.city, 8, false, 2);
    y += 2;
  }

  // Artikel
  divider();
  for (const item of items) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    const prefix = `${item.quantity}x `;
    if (showPrices) {
      const priceStr = formatCents(item.price * item.quantity - item.discount);
      const priceW = doc.getTextWidth(priceStr) + 2;
      const nameMaxW = PRINT_W - priceW - 6;
      const nameLines = doc.splitTextToSize(item.name, nameMaxW - doc.getTextWidth(prefix)) as string[];
      doc.text(prefix + nameLines[0], MARGIN, y);
      doc.text(priceStr, COL_R, y, { align: 'right' });
      for (let li = 1; li < nameLines.length; li++) {
        y += lineH(8);
        doc.text('   ' + nameLines[li], MARGIN, y);
      }
    } else {
      const nameLines = doc.splitTextToSize(item.name, PRINT_W - doc.getTextWidth(prefix)) as string[];
      doc.text(prefix + nameLines[0], MARGIN, y);
      for (let li = 1; li < nameLines.length; li++) {
        y += lineH(8);
        doc.text('   ' + nameLines[li], MARGIN, y);
      }
    }
    y += lineH(8) + 1;
  }

  // Gesamt
  divider();
  if (showPrices) {
    const totalGross = items.reduce((s, i) => s + i.price * i.quantity - i.discount, 0);
    row('GESAMT', formatCents(totalGross), 10, true);
    y += 2;
    divider();
  }
  ctr('*** KEINE RECHNUNG ***', 8, true);

  doc.save(`Lieferbon_${Date.now()}.pdf`);
}
