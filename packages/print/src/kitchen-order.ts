/**
 * @kassomat/print — Kitchen Order Printer
 *
 * Builds an ESC/POS byte stream for a kitchen order ticket.
 * Only shows: table label, timestamp, items (name + quantity + notes).
 * No prices, no VAT, no QR code — just what the kitchen needs.
 */

import { EscPosBuilder } from './escpos';
import type { PrinterConfig } from './types';
import * as net from 'net';
import * as fs from 'fs';

// ============================================================
// Types
// ============================================================

export interface KitchenOrderItem {
  name: string;
  quantity: number;
  notes?: string;
}

export interface KitchenOrder {
  /** Table label or order identifier */
  tableLabel: string;
  /** Timestamp of the order */
  timestamp: Date;
  /** Items to prepare */
  items: KitchenOrderItem[];
  /** Order type indicator */
  orderType: 'dine_in' | 'delivery';
  /** Optional delivery info */
  deliveryNote?: string;
}

// ============================================================
// Formatting
// ============================================================

function formatTime(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${formatTime(date)}`;
}

// ============================================================
// Builder
// ============================================================

const WIDTH = 42;

export function buildKitchenOrderBuffer(order: KitchenOrder): Buffer {
  const b = new EscPosBuilder();
  b.init();

  // --- Header: large "KÜCHE" banner ---
  b.align('center');
  b.bold(true);
  b.fontSize(2);
  if (order.orderType === 'delivery') {
    b.text('LIEFERUNG');
  } else {
    b.text('KÜCHE');
  }
  b.fontSize(1);
  b.feed(1);

  // --- Table / order info ---
  b.fontSize(2);
  b.text(order.tableLabel);
  b.fontSize(1);
  b.bold(false);
  b.feed(1);

  // --- Timestamp ---
  b.text(formatDate(order.timestamp));
  b.feed(1);

  // --- Separator ---
  b.align('left');
  b.text('─'.repeat(WIDTH));
  b.feed(1);

  // --- Items ---
  b.bold(true);
  for (const item of order.items) {
    // Quantity + name in large text
    b.fontSize(2);
    b.text(`${item.quantity}x ${item.name}`);
    b.fontSize(1);

    // Notes in normal size, indented
    if (item.notes) {
      b.bold(false);
      b.text(`   → ${item.notes}`);
      b.bold(true);
    }
  }
  b.bold(false);

  // --- Delivery note ---
  if (order.deliveryNote) {
    b.feed(1);
    b.text('─'.repeat(WIDTH));
    b.text(`Anmerkung: ${order.deliveryNote}`);
  }

  // --- Footer ---
  b.feed(1);
  b.text('─'.repeat(WIDTH));
  b.align('center');
  b.text(formatTime(order.timestamp));
  b.feed(3);
  b.cut();

  return b.build();
}

// ============================================================
// Send to printer
// ============================================================

export async function printKitchenOrder(
  order: KitchenOrder,
  config: PrinterConfig,
): Promise<void> {
  const buffer = buildKitchenOrderBuffer(order);

  if (config.type === 'network' && config.host) {
    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      const port = config.port ?? 9100;
      socket.connect(port, config.host!, () => {
        socket.write(buffer, () => {
          socket.end();
          resolve();
        });
      });
      socket.on('error', reject);
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('Kitchen printer connection timeout'));
      });
    });
  } else if (config.type === 'file' && config.outputPath) {
    await fs.promises.writeFile(config.outputPath, buffer);
  }
}
