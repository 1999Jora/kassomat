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

const W = 42; // 42 chars = 80mm thermal printer

/** Center text within 42 chars */
function center(text: string): string {
  if (text.length >= W) return text.substring(0, W);
  const pad = Math.floor((W - text.length) / 2);
  return ' '.repeat(pad) + text;
}

/** Left-right justified within 42 chars */
function leftRight(left: string, right: string): string {
  const gap = W - left.length - right.length;
  if (gap < 1) return (left + ' ' + right).substring(0, W);
  return left + ' '.repeat(gap) + right;
}

/** Divider */
function divider(char = '='): string {
  return char.repeat(W);
}

/**
 * Lieferbon — matches the thermal printer preview exactly.
 * Monospace, 42 chars, black on white, no RKSV.
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

  // Build all lines first
  const lines: Array<{ text: string; bold?: boolean; big?: boolean }> = [];

  lines.push({ text: center('*** KEINE RECHNUNG ***'), bold: true });
  lines.push({ text: center(title), bold: true, big: true });
  if (showTenant) lines.push({ text: center(tenantName.toUpperCase()), bold: true });
  lines.push({ text: divider('=') });

  const dateStr = new Date().toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  lines.push({ text: `Datum: ${dateStr}` });
  lines.push({ text: '' });

  if (showAddr && (delivery.name || delivery.street || delivery.city)) {
    lines.push({ text: divider('-') });
    lines.push({ text: 'LIEFERADRESSE:', bold: true });
    if (delivery.name) lines.push({ text: `  ${delivery.name}`, bold: true });
    if (delivery.street) lines.push({ text: `  ${delivery.street}` });
    if (delivery.city) lines.push({ text: `  ${delivery.city}` });
    lines.push({ text: '' });
  }

  lines.push({ text: divider('=') });
  for (const item of items) {
    const label = `${item.quantity}x ${item.name}`;
    if (showPrices) {
      const price = formatCents(item.price * item.quantity - item.discount);
      const trimmed = label.length > W - price.length - 1
        ? label.substring(0, W - price.length - 2) + '.'
        : label;
      lines.push({ text: leftRight(trimmed, price) });
    } else {
      lines.push({ text: label.substring(0, W) });
    }
  }

  if (showPrices) {
    lines.push({ text: divider('=') });
    const totalGross = items.reduce((s, i) => s + i.price * i.quantity - i.discount, 0);
    lines.push({ text: leftRight('GESAMT', formatCents(totalGross)), bold: true });
  }
  lines.push({ text: divider('=') });
  lines.push({ text: center('*** KEINE RECHNUNG ***'), bold: true });

  // Render to PDF — monospace, fixed size
  const PAGE_W = 80; // mm
  const MARGIN = 4;
  const FONT_SIZE = 8;
  const LINE_H = 3.6;
  const BIG_SIZE = 10;
  const BIG_LINE_H = 4.5;
  const totalH = Math.max(80, lines.length * LINE_H + 20);

  const doc = new jsPDF({ unit: 'mm', format: [PAGE_W, totalH], orientation: 'portrait' });
  let y = 8;

  for (const line of lines) {
    const size = line.big ? BIG_SIZE : FONT_SIZE;
    const lh = line.big ? BIG_LINE_H : LINE_H;
    doc.setFont('courier', line.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(line.text, MARGIN, y);
    y += lh;
  }

  doc.save(`Lieferbon_${Date.now()}.pdf`);
}
