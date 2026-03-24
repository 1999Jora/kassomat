/**
 * @kassomat/print — Receipt Printer
 *
 * Builds an ESC/POS byte stream for a receipt and dispatches it to
 * a file, network (TCP), or USB printer.
 *
 * All money values are in cents; divide by 100 for euro display.
 * Dates are formatted in Austrian locale: DD.MM.YYYY HH:MM
 */

import * as fs from 'fs';
import * as net from 'net';
import { EscPosBuilder } from './escpos';
import type { ReceiptData, TenantInfo, PrinterConfig } from './types';

// ============================================================
// Formatting helpers
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

/** Translate PaymentMethod to German label */
function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'cash':   return 'Bargeld';
    case 'card':   return 'Karte';
    case 'online': return 'Online';
    default:       return method;
  }
}

// ============================================================
// Receipt layout builder
// ============================================================

/** Width in characters for a 80mm paper roll (42 chars) */
const WIDTH = 42;

/**
 * Builds the complete ESC/POS Buffer for a receipt.
 */
export function buildReceiptBuffer(receipt: ReceiptData, tenant: TenantInfo): Buffer {
  const b = new EscPosBuilder();

  // --- Initialize ---
  b.init();

  // --- Header: tenant name ---
  b.align('center');
  b.bold(true);
  b.fontSize(2);
  b.text(tenant.name);
  b.fontSize(1);
  b.bold(false);

  if (tenant.address) {
    b.text(tenant.address);
  }
  if (tenant.city) {
    b.text(tenant.city);
  }
  if (tenant.vatNumber) {
    b.text(`UID: ${tenant.vatNumber}`);
  }

  b.feed(1);

  // --- Receipt meta ---
  b.align('left');
  b.printLine('Bon-Nr.:', receipt.receiptNumber, WIDTH);
  b.printLine('Kasse:',   receipt.cashRegisterId, WIDTH);
  b.printLine('Datum:',   formatAustrianDate(receipt.createdAt), WIDTH);
  b.printLine('Kassierer:', receipt.cashierName, WIDTH);

  if (receipt.rksvBelegnummer) {
    b.printLine('Belegnr.:', receipt.rksvBelegnummer, WIDTH);
  }
  if (receipt.rksvRegistrierkasseId) {
    b.printLine('RK-ID:', receipt.rksvRegistrierkasseId, WIDTH);
  }

  b.divider(WIDTH);

  // --- Items ---
  for (const item of receipt.items) {
    const lineTotal = formatEuro(item.totalGross);
    // First line: product name + total
    b.printLine(item.productName, lineTotal, WIDTH);
    // Second line: qty × unit price indented
    const qtyLine = `  ${item.quantity}x ${formatEuro(item.unitPrice)}`;
    const vatLabel = `MwSt ${item.vatRate}%`;
    b.printLine(qtyLine, vatLabel, WIDTH);
    if (item.discount > 0) {
      b.printLine('  Rabatt:', `-${formatEuro(item.discount)}`, WIDTH);
    }
  }

  b.divider(WIDTH);

  // --- Totals ---
  b.printLine('Netto:', formatEuro(receipt.totals.subtotalNet), WIDTH);

  if (receipt.totals.vat0 > 0) {
    b.printLine('MwSt 0%:', formatEuro(receipt.totals.vat0), WIDTH);
  }
  if (receipt.totals.vat10 > 0) {
    b.printLine('MwSt 10%:', formatEuro(receipt.totals.vat10), WIDTH);
  }
  if (receipt.totals.vat20 > 0) {
    b.printLine('MwSt 20%:', formatEuro(receipt.totals.vat20), WIDTH);
  }

  b.bold(true);
  b.printLine('GESAMT:', formatEuro(receipt.totals.totalGross), WIDTH);
  b.bold(false);

  b.divider(WIDTH);

  // --- Payment ---
  b.printLine('Zahlungsart:', paymentMethodLabel(receipt.payment.method), WIDTH);
  b.printLine('Bezahlt:', formatEuro(receipt.payment.amountPaid), WIDTH);

  if (receipt.payment.method === 'cash' && receipt.payment.change > 0) {
    b.printLine('Wechselgeld:', formatEuro(receipt.payment.change), WIDTH);
  }
  if (receipt.payment.tip > 0) {
    b.printLine('Trinkgeld:', formatEuro(receipt.payment.tip), WIDTH);
  }

  // --- RKSV QR Code ---
  if (receipt.rksvQrCodeData) {
    b.feed(1);
    b.align('center');
    b.text('RKSV-Signatur');
    b.qrCode(receipt.rksvQrCodeData, 4);
    b.feed(1);
  }

  b.divider(WIDTH);

  // --- Footer ---
  b.align('center');
  const footer = tenant.receiptFooter ?? 'Danke für Ihren Besuch!';
  b.text(footer);

  b.feed(3);
  b.cut();

  return b.build();
}

// ============================================================
// Transport layer
// ============================================================

/** Send bytes to a file (for testing / virtual printers / CUPS) */
async function sendToFile(data: Buffer, outputPath: string): Promise<void> {
  await fs.promises.writeFile(outputPath, data);
}

/** Send bytes over a TCP connection to a network printer */
async function sendToNetwork(data: Buffer, host: string, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = 10_000; // 10 s

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      socket.write(data, (err) => {
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end(() => {
          socket.destroy();
          resolve();
        });
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Printer connection timed out after ${timeout}ms (${host}:${port})`));
    });
  });
}

/** Send bytes to a USB printer device file */
async function sendToUsb(data: Buffer, usbPath?: string): Promise<void> {
  // On Linux: /dev/usb/lp0
  // On Windows: typically handled via a virtual COM port or file pipe
  const devicePath = usbPath ??
    (process.platform === 'win32' ? '\\\\.\\COM1' : '/dev/usb/lp0');

  await fs.promises.writeFile(devicePath, data);
}

// ============================================================
// Public API
// ============================================================

/**
 * Build and dispatch an ESC/POS receipt to the configured printer.
 *
 * @param receipt  Structured receipt data
 * @param tenant   Tenant info for the receipt header
 * @param config   Printer connection configuration
 */
export async function printReceipt(
  receipt: ReceiptData,
  tenant: TenantInfo,
  config: PrinterConfig,
): Promise<void> {
  const buffer = buildReceiptBuffer(receipt, tenant);

  switch (config.type) {
    case 'file': {
      if (!config.outputPath) {
        throw new Error('PrinterConfig.outputPath is required when type is "file"');
      }
      await sendToFile(buffer, config.outputPath);
      break;
    }

    case 'network': {
      if (!config.host) {
        throw new Error('PrinterConfig.host is required when type is "network"');
      }
      const port = config.port ?? 9100;
      await sendToNetwork(buffer, config.host, port);
      break;
    }

    case 'usb': {
      await sendToUsb(buffer, config.usbPath);
      break;
    }

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = config.type;
      throw new Error(`Unknown printer type: ${String(_exhaustive)}`);
    }
  }
}
