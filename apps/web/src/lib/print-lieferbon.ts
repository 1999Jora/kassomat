import { jsPDF } from 'jspdf';
import { formatCents } from './formatters';
import type { CartItem } from '../store/useAppStore';
import type { DeliveryInfo } from '../store/useAppStore';

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

/**
 * Lieferbon für POS-Lieferungen.
 * Kein RKSV QR-Code, "KEINE RECHNUNG" oben, mit Lieferadresse.
 */
export async function printLieferbon(
  items: CartItem[],
  delivery: DeliveryInfo,
  tenantName = 'Kassomat',
): Promise<void> {
  const W = 80;
  const MARGIN = 5;
  const PRINT_W = W - MARGIN * 2;
  const LINE_H = 5;
  const COL_R = W - MARGIN;

  const lines = 24 + items.length * 2 + 8;
  const H = Math.max(150, (lines + 40) * 5 + 20);
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' });
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

  // ── KEINE RECHNUNG Banner ──
  ctr('*** KEINE RECHNUNG ***', 11, true);
  ctr('LIEFERBON', 14, true);
  y += 2;
  ctr(tenantName.toUpperCase(), 9, true);
  y += 1;
  divider();

  // Datum
  const dateStr = new Date().toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  txt(`Datum: ${dateStr}`, 7);
  y += 1;

  // Lieferadresse
  if (delivery.name || delivery.street || delivery.city) {
    divider(true);
    txt('LIEFERADRESSE:', 8, true);
    if (delivery.name) txt(delivery.name, 10, true, 2);
    if (delivery.street) txt(delivery.street, 9, false, 2);
    if (delivery.city) txt(delivery.city, 9, false, 2);
    y += 2;
  }

  // Artikel
  divider();
  for (const item of items) {
    const priceStr = formatCents(item.price * item.quantity - item.discount);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
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

  // Gesamt
  divider();
  const totalGross = items.reduce((s, i) => s + i.price * i.quantity - i.discount, 0);
  row('GESAMT', formatCents(totalGross), 10, true);
  y += 2;
  divider();
  ctr('*** KEINE RECHNUNG ***', 9, true);

  doc.save(`Lieferbon_${Date.now()}.pdf`);
}
