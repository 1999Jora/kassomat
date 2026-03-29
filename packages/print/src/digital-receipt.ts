/**
 * @kassomat/print — Digital Receipt Generator
 *
 * Generates a full HTML document that looks like a real 80mm thermal printer
 * receipt: monospace font, 42 characters wide, black on white, centered.
 *
 * All money values are in cents; divide by 100 for euro display.
 * Dates are formatted in Austrian locale: DD.MM.YYYY HH:MM
 */

import QRCode from 'qrcode';
import type { ReceiptData, TenantInfo } from './types';

// ============================================================
// Formatting helpers
// ============================================================

const W = 42; // 80mm thermal = 42 chars

/** Format a cent integer as a euro string, e.g. 250 → "€2,50" */
function fmtEuro(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const centsPart = abs % 100;
  const formatted = `${euros},${String(centsPart).padStart(2, '0')}`;
  return negative ? `-${formatted}` : formatted;
}

/** Format a Date as Austrian DD.MM.YYYY HH:MM */
function fmtDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Translate payment method to German label */
function paymentLabel(method: string): string {
  switch (method) {
    case 'cash':   return 'Bargeld';
    case 'card':   return 'Karte';
    case 'online': return 'Online';
    default:       return method;
  }
}

/** Escape text for safe HTML insertion */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Center text within W chars */
function center(text: string): string {
  if (text.length >= W) return text.substring(0, W);
  const pad = Math.floor((W - text.length) / 2);
  return ' '.repeat(pad) + text;
}

/** Left-right justified within W chars */
function leftRight(left: string, right: string): string {
  const gap = W - left.length - right.length;
  if (gap < 1) return (left + ' ' + right).substring(0, W);
  return left + ' '.repeat(gap) + right;
}

/** Divider line */
function divider(char = '-'): string {
  return char.repeat(W);
}

// ============================================================
// HTML Generator
// ============================================================

export async function generateDigitalReceiptHTML(receipt: ReceiptData, tenant: TenantInfo): Promise<string> {
  const lines: Array<{ text: string; bold?: boolean; big?: boolean }> = [];

  const isDemoSigning = receipt.rksvCertSerial === 'AT0-DEMO';

  // Header
  lines.push({ text: center(tenant.name.toUpperCase()), bold: true, big: true });
  if (tenant.address) lines.push({ text: center(tenant.address) });
  if (tenant.city) lines.push({ text: center(tenant.city) });
  if (tenant.vatNumber) lines.push({ text: center(`UID: ${tenant.vatNumber}`) });
  lines.push({ text: '' });

  // Meta
  lines.push({ text: leftRight('Bon-Nr.:', receipt.receiptNumber) });
  lines.push({ text: leftRight('Kasse:', receipt.cashRegisterId) });
  lines.push({ text: leftRight('Datum:', fmtDate(receipt.createdAt)) });
  lines.push({ text: leftRight('Kassierer:', receipt.cashierName) });
  if (receipt.rksvBelegnummer) lines.push({ text: leftRight('Belegnr.:', receipt.rksvBelegnummer) });
  if (receipt.rksvRegistrierkasseId) lines.push({ text: leftRight('RK-ID:', receipt.rksvRegistrierkasseId) });
  lines.push({ text: divider() });

  // Items
  for (const item of receipt.items) {
    const total = fmtEuro(item.totalGross);
    const name = item.productName.length > W - total.length - 1
      ? item.productName.substring(0, W - total.length - 2) + '.'
      : item.productName;
    lines.push({ text: leftRight(name, total), bold: true });
    lines.push({ text: `  ${item.quantity}x ${fmtEuro(item.unitPrice)}    MwSt ${item.vatRate}%` });
    if (item.discount > 0) {
      lines.push({ text: leftRight('  Rabatt', `-${fmtEuro(item.discount)}`) });
    }
  }
  lines.push({ text: divider() });

  // Totals
  lines.push({ text: leftRight('Netto:', fmtEuro(receipt.totals.subtotalNet)) });
  if (receipt.totals.vat0 > 0) lines.push({ text: leftRight('MwSt 0%:', fmtEuro(receipt.totals.vat0)) });
  if (receipt.totals.vat10 > 0) lines.push({ text: leftRight('MwSt 10%:', fmtEuro(receipt.totals.vat10)) });
  if (receipt.totals.vat13 > 0) lines.push({ text: leftRight('MwSt 13%:', fmtEuro(receipt.totals.vat13)) });
  if (receipt.totals.vat20 > 0) lines.push({ text: leftRight('MwSt 20%:', fmtEuro(receipt.totals.vat20)) });
  lines.push({ text: divider('=') });
  lines.push({ text: leftRight('GESAMT:', fmtEuro(receipt.totals.totalGross)), bold: true, big: true });
  lines.push({ text: divider() });

  // Payment
  lines.push({ text: leftRight('Zahlungsart:', paymentLabel(receipt.payment.method)) });
  lines.push({ text: leftRight('Bezahlt:', fmtEuro(receipt.payment.amountPaid)) });
  if (receipt.payment.method === 'cash' && receipt.payment.change > 0) {
    lines.push({ text: leftRight('Wechselgeld:', fmtEuro(receipt.payment.change)) });
  }
  if (receipt.payment.tip > 0) {
    lines.push({ text: leftRight('Trinkgeld:', fmtEuro(receipt.payment.tip)) });
  }

  // Build the lines HTML
  const linesHtml = lines.map(l => {
    const t = esc(l.text);
    if (l.bold && l.big) return `<div class="line bold big">${t}</div>`;
    if (l.bold) return `<div class="line bold">${t}</div>`;
    return `<div class="line">${t}</div>`;
  }).join('\n    ');

  // RKSV QR Code
  let qrHtml = '';
  if (receipt.rksvQrCodeData) {
    const qrSvg = await QRCode.toString(receipt.rksvQrCodeData, {
      type: 'svg',
      width: 180,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
    qrHtml = `
    <div class="line" style="margin-top:8px;">${esc(center('RKSV-Signatur'))}</div>
    <div style="text-align:center;margin:8px 0;">${qrSvg}</div>`;
  } else {
    qrHtml = `
    <div class="line" style="margin-top:8px;">${esc(center('*** SIGNATUR AUSSTEHEND ***'))}</div>`;
  }

  // Footer
  const footer = tenant.receiptFooter ?? 'Danke fuer Ihren Besuch!';

  // Logo
  const logoHtml = tenant.logoBase64
    ? `<div style="text-align:center;margin-bottom:8px;"><img src="${tenant.logoBase64}" alt="" style="max-height:60px;max-width:240px;" /></div>`
    : '';

  // Demo banner
  const demoBanner = isDemoSigning
    ? `<div style="background:#000;color:#fff;text-align:center;padding:6px 0;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;letter-spacing:1px;">*** DEMO-SIGNATUR ***</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kassenbon ${esc(receipt.receiptNumber)} - ${esc(tenant.name)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      background: #e8e8e8;
      color: #000;
      padding: 20px 8px;
      font-size: 13px;
      line-height: 1.4;
    }
    .receipt {
      max-width: 380px;
      margin: 0 auto;
      background: #fff;
      padding: 16px 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border-radius: 2px;
    }
    .line {
      white-space: pre;
      font-size: 13px;
      line-height: 1.5;
    }
    .line.bold {
      font-weight: 700;
    }
    .line.big {
      font-size: 16px;
      line-height: 1.6;
    }
    .footer {
      text-align: center;
      margin-top: 8px;
      font-size: 12px;
      color: #666;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .receipt { box-shadow: none; max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    ${demoBanner}
    ${logoHtml}
    ${linesHtml}
    ${qrHtml}
    <div class="line">${esc(divider())}</div>
    <div class="line">${esc(center(footer))}</div>
    <div class="footer" style="margin-top:16px;font-size:10px;color:#aaa;">Elektronisch erstellt</div>
  </div>
</body>
</html>`;
}

/**
 * Generate the URL for the digital receipt web page.
 */
export function generateDigitalReceiptURL(receiptId: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/receipts/${receiptId}/digital`;
}
