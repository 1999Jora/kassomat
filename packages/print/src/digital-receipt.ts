/**
 * @kassomat/print — Digital Receipt Generator
 *
 * Generates a full HTML document suitable for email delivery or web display.
 * The layout mirrors the thermal receipt: header, items, totals, VAT breakdown,
 * payment, RKSV QR code, footer.
 *
 * All money values are in cents; divide by 100 for euro display.
 * Dates are formatted in Austrian locale: DD.MM.YYYY HH:MM
 */

import type { ReceiptData, TenantInfo } from './types';

// ============================================================
// Formatting helpers (duplicated from receipt-printer to keep
// digital-receipt.ts self-contained with no internal imports)
// ============================================================

/** Format a cent integer as a euro string, e.g. 250 → "€2,50" */
function formatEuro(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const centsPart = abs % 100;
  const formatted = `€${euros},${String(centsPart).padStart(2, '0')}`;
  return negative ? `-${formatted}` : formatted;
}

/** Format a Date as Austrian DD.MM.YYYY HH:MM */
function formatAustrianDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

/** Translate payment method to German label */
function paymentMethodLabel(method: string): string {
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

// ============================================================
// HTML Generator
// ============================================================

/**
 * Generate a full HTML document representing the digital receipt.
 * The HTML is self-contained with inline styles for email client compatibility.
 *
 * @param receipt  Structured receipt data
 * @param tenant   Tenant info for the receipt header
 * @returns        Complete HTML document string
 */
export function generateDigitalReceiptHTML(receipt: ReceiptData, tenant: TenantInfo): string {
  // Build item rows HTML
  const itemRows = receipt.items.map((item) => {
    const lineTotal = formatEuro(item.totalGross);
    const unitPrice = formatEuro(item.unitPrice);
    const discountRow = item.discount > 0
      ? `<tr>
           <td style="padding:2px 8px 2px 24px;color:#666;font-size:13px;" colspan="3">Rabatt</td>
           <td style="padding:2px 8px 2px 0;text-align:right;color:#e53e3e;font-size:13px;">-${esc(formatEuro(item.discount))}</td>
         </tr>`
      : '';
    return `
      <tr>
        <td style="padding:6px 8px 2px 0;font-weight:600;">${esc(item.productName)}</td>
        <td style="padding:6px 0 2px 0;text-align:right;white-space:nowrap;">${esc(String(item.quantity))}×${esc(unitPrice)}</td>
        <td style="padding:6px 8px 2px 8px;color:#888;font-size:12px;text-align:center;">MwSt ${item.vatRate}%</td>
        <td style="padding:6px 0 2px 0;text-align:right;font-weight:600;white-space:nowrap;">${esc(lineTotal)}</td>
      </tr>
      ${discountRow}
    `;
  }).join('');

  // Build VAT breakdown rows
  const vatRows: string[] = [];
  if (receipt.totals.vat0 > 0) {
    vatRows.push(`
      <tr>
        <td style="padding:3px 0;color:#555;">MwSt 0%</td>
        <td style="padding:3px 0;text-align:right;color:#555;">${esc(formatEuro(receipt.totals.vat0))}</td>
      </tr>`);
  }
  if (receipt.totals.vat10 > 0) {
    vatRows.push(`
      <tr>
        <td style="padding:3px 0;color:#555;">MwSt 10%</td>
        <td style="padding:3px 0;text-align:right;color:#555;">${esc(formatEuro(receipt.totals.vat10))}</td>
      </tr>`);
  }
  if (receipt.totals.vat20 > 0) {
    vatRows.push(`
      <tr>
        <td style="padding:3px 0;color:#555;">MwSt 20%</td>
        <td style="padding:3px 0;text-align:right;color:#555;">${esc(formatEuro(receipt.totals.vat20))}</td>
      </tr>`);
  }

  // Payment section
  const changeRow = receipt.payment.method === 'cash' && receipt.payment.change > 0
    ? `<tr>
         <td style="padding:3px 0;color:#555;">Wechselgeld</td>
         <td style="padding:3px 0;text-align:right;color:#555;">${esc(formatEuro(receipt.payment.change))}</td>
       </tr>`
    : '';

  const tipRow = receipt.payment.tip > 0
    ? `<tr>
         <td style="padding:3px 0;color:#555;">Trinkgeld</td>
         <td style="padding:3px 0;text-align:right;color:#555;">${esc(formatEuro(receipt.payment.tip))}</td>
       </tr>`
    : '';

  // RKSV QR section — rendered as a link for digital receipts (no raster image needed)
  const rksvSection = receipt.rksvQrCodeData
    ? `<tr>
         <td colspan="2" style="padding:20px 0 8px 0;text-align:center;">
           <p style="margin:0 0 8px;font-size:12px;color:#888;letter-spacing:0.05em;text-transform:uppercase;">RKSV-Signatur</p>
           <div style="display:inline-block;padding:8px;border:1px solid #e2e8f0;border-radius:4px;background:#fafafa;">
             <p style="margin:0;font-size:10px;font-family:monospace;word-break:break-all;color:#333;max-width:320px;">${esc(receipt.rksvQrCodeData)}</p>
           </div>
         </td>
       </tr>`
    : '';

  // Meta rows
  const rksvMetaRows: string[] = [];
  if (receipt.rksvBelegnummer) {
    rksvMetaRows.push(`<tr>
      <td style="padding:2px 0;font-size:12px;color:#888;">Belegnr.:</td>
      <td style="padding:2px 0;font-size:12px;color:#888;text-align:right;">${esc(receipt.rksvBelegnummer)}</td>
    </tr>`);
  }
  if (receipt.rksvRegistrierkasseId) {
    rksvMetaRows.push(`<tr>
      <td style="padding:2px 0;font-size:12px;color:#888;">RK-ID:</td>
      <td style="padding:2px 0;font-size:12px;color:#888;text-align:right;">${esc(receipt.rksvRegistrierkasseId)}</td>
    </tr>`);
  }

  const footer = tenant.receiptFooter ?? 'Danke für Ihren Besuch!';

  const addressLines: string[] = [];
  if (tenant.address) addressLines.push(`<div>${esc(tenant.address)}</div>`);
  if (tenant.city) addressLines.push(`<div>${esc(tenant.city)}</div>`);
  if (tenant.vatNumber) addressLines.push(`<div style="margin-top:4px;font-size:13px;color:#888;">UID: ${esc(tenant.vatNumber)}</div>`);

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kassenbon ${esc(receipt.receiptNumber)} — ${esc(tenant.name)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f0f4f8;
      color: #1a202c;
      padding: 24px 16px;
      font-size: 15px;
      line-height: 1.5;
    }
    .receipt {
      max-width: 480px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .receipt-header {
      background: #1a202c;
      color: #ffffff;
      padding: 28px 24px 20px;
      text-align: center;
    }
    .receipt-header h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .receipt-header .subtitle {
      font-size: 13px;
      color: #a0aec0;
      margin-top: 4px;
    }
    .receipt-body {
      padding: 0 24px;
    }
    .section {
      padding: 16px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .section:last-child {
      border-bottom: none;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .meta-table td {
      padding: 3px 0;
    }
    .meta-table td:last-child {
      text-align: right;
      font-weight: 500;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .total-row td {
      padding: 8px 0 4px;
      font-size: 17px;
      font-weight: 700;
      border-top: 2px solid #1a202c;
    }
    .receipt-footer {
      background: #f7fafc;
      padding: 20px 24px;
      text-align: center;
      font-size: 14px;
      color: #718096;
      border-top: 1px solid #e2e8f0;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      background: #ebf8ff;
      color: #2b6cb0;
      font-size: 12px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="receipt">

    <!-- Header -->
    <div class="receipt-header">
      <h1>${esc(tenant.name)}</h1>
      <div class="subtitle">
        ${addressLines.join('\n        ')}
      </div>
    </div>

    <div class="receipt-body">

      <!-- Receipt meta -->
      <div class="section">
        <table class="meta-table">
          <tr>
            <td style="color:#718096;">Bon-Nr.</td>
            <td><span class="badge">${esc(receipt.receiptNumber)}</span></td>
          </tr>
          <tr>
            <td style="color:#718096;">Kasse</td>
            <td>${esc(receipt.cashRegisterId)}</td>
          </tr>
          <tr>
            <td style="color:#718096;">Datum</td>
            <td>${esc(formatAustrianDate(receipt.createdAt))}</td>
          </tr>
          <tr>
            <td style="color:#718096;">Kassierer</td>
            <td>${esc(receipt.cashierName)}</td>
          </tr>
          ${rksvMetaRows.join('\n          ')}
        </table>
      </div>

      <!-- Items -->
      <div class="section">
        <table class="items-table">
          ${itemRows}
        </table>
      </div>

      <!-- Totals -->
      <div class="section">
        <table class="totals-table">
          <tr>
            <td style="padding:3px 0;color:#555;">Netto</td>
            <td style="padding:3px 0;text-align:right;color:#555;">${esc(formatEuro(receipt.totals.subtotalNet))}</td>
          </tr>
          ${vatRows.join('\n          ')}
          <tr class="total-row">
            <td>Gesamt</td>
            <td style="text-align:right;">${esc(formatEuro(receipt.totals.totalGross))}</td>
          </tr>
        </table>
      </div>

      <!-- Payment -->
      <div class="section">
        <table class="totals-table">
          <tr>
            <td style="padding:3px 0;color:#555;">Zahlungsart</td>
            <td style="padding:3px 0;text-align:right;font-weight:600;">${esc(paymentMethodLabel(receipt.payment.method))}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;color:#555;">Bezahlt</td>
            <td style="padding:3px 0;text-align:right;">${esc(formatEuro(receipt.payment.amountPaid))}</td>
          </tr>
          ${changeRow}
          ${tipRow}
        </table>
      </div>

      <!-- RKSV QR Code -->
      ${receipt.rksvQrCodeData ? `<div class="section">
        <table class="totals-table">
          ${rksvSection}
        </table>
      </div>` : ''}

    </div><!-- /receipt-body -->

    <!-- Footer -->
    <div class="receipt-footer">
      <p>${esc(footer)}</p>
      <p style="margin-top:8px;font-size:12px;color:#a0aec0;">Dieser Bon wurde elektronisch erstellt und ist ohne Unterschrift gültig.</p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Generate the URL for the digital receipt web page.
 *
 * @param receiptId  Receipt UUID
 * @param baseUrl    Base URL of the API server (no trailing slash)
 * @returns          Full URL to the digital receipt page
 */
export function generateDigitalReceiptURL(receiptId: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/receipts/${receiptId}/digital`;
}
