/**
 * @kassomat/print
 * ESC/POS thermal printing package and digital receipt service.
 *
 * Public API:
 *  - EscPosBuilder         — raw ESC/POS byte builder
 *  - buildReceiptBuffer    — assemble ESC/POS Buffer for a receipt
 *  - printReceipt          — build + dispatch to printer (file / network / USB)
 *  - generateDigitalReceiptHTML — full HTML document for email / web
 *  - generateDigitalReceiptURL  — URL helper for the digital receipt endpoint
 *  - Types: ReceiptData, PrintReceiptItem, TenantInfo, PrinterConfig, PrintJob, …
 */

export { EscPosBuilder } from './escpos';
export { buildReceiptBuffer, printReceipt } from './receipt-printer';
export { generateDigitalReceiptHTML, generateDigitalReceiptURL } from './digital-receipt';
export type {
  PrinterConfig,
  PrinterConnectionType,
  PrintReceiptItem,
  PrintPayment,
  PrintPaymentMethod,
  PrintTotals,
  PrintVatRate,
  ReceiptData,
  TenantInfo,
  PrintJob,
  PrintJobStatus,
} from './types';
