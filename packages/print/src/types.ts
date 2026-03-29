/**
 * @kassomat/print — Type Definitions
 * All money values are in cents (integer).
 */

// ============================================================
// PRINTER CONFIGURATION
// ============================================================

/** How the printer is connected */
export type PrinterConnectionType = 'usb' | 'network' | 'file';

/** Printer connection configuration */
export interface PrinterConfig {
  /** Connection method */
  type: PrinterConnectionType;
  /** TCP host for network printers (required when type='network') */
  host?: string;
  /** TCP port for network printers (default: 9100) */
  port?: number;
  /** File path for file output (required when type='file') */
  outputPath?: string;
  /** USB device path — defaults to /dev/usb/lp0 on Linux */
  usbPath?: string;
}

// ============================================================
// RECEIPT DATA
// ============================================================

/** Austrian VAT rates */
export type PrintVatRate = 0 | 10 | 13 | 20;

/** A single line item on a receipt */
export interface PrintReceiptItem {
  productName: string;
  quantity: number;
  /** Unit price in cents */
  unitPrice: number;
  vatRate: PrintVatRate;
  /** Discount in cents (0 if none) */
  discount: number;
  /** Net total in cents */
  totalNet: number;
  /** VAT amount in cents */
  totalVat: number;
  /** Gross total in cents */
  totalGross: number;
}

/** Payment method */
export type PrintPaymentMethod = 'cash' | 'card' | 'online';

/** Payment details */
export interface PrintPayment {
  method: PrintPaymentMethod;
  /** Amount paid in cents */
  amountPaid: number;
  /** Change in cents (cash only) */
  change: number;
  /** Tip in cents */
  tip: number;
}

/** VAT breakdown totals */
export interface PrintTotals {
  /** Net subtotal in cents */
  subtotalNet: number;
  /** VAT at 0% in cents */
  vat0: number;
  /** VAT at 10% in cents */
  vat10: number;
  /** VAT at 13% in cents (Gastronomie-Sondersatz) */
  vat13: number;
  /** VAT at 20% in cents */
  vat20: number;
  /** Total VAT in cents */
  totalVat: number;
  /** Gross total in cents */
  totalGross: number;
}

/** Full receipt data for printing */
export interface ReceiptData {
  /** Receipt UUID */
  id: string;
  /** Human-readable receipt number e.g. "2024-000042" */
  receiptNumber: string;
  /** Cash register identifier */
  cashRegisterId: string;
  /** Receipt type */
  type: 'sale' | 'cancellation' | 'training' | 'null_receipt' | 'start_receipt' | 'month_receipt' | 'year_receipt' | 'closing_receipt';
  /** UTC timestamp of receipt creation */
  createdAt: Date;
  /** Name of the cashier */
  cashierName: string;
  /** Line items */
  items: PrintReceiptItem[];
  /** Payment info */
  payment: PrintPayment;
  /** Totals with VAT breakdown */
  totals: PrintTotals;
  /** RKSV QR code data string — null if not yet signed */
  rksvQrCodeData: string | null;
  /** RKSV Belegnummer */
  rksvBelegnummer: string | null;
  /** RKSV Kassen-ID */
  rksvRegistrierkasseId: string | null;
  /** Certificate serial — 'AT0-DEMO' when demo/HMAC signing is active */
  rksvCertSerial: string | null;
  /** Receipt type identifier (e.g. 'cancellation', 'training') */
  receiptType?: string;
  /** Original receipt number for cancellation receipts (Storno) */
  cancelledReceiptNumber?: string;
}

// ============================================================
// TENANT INFO
// ============================================================

/** Tenant information used for receipt headers */
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  /** Street address */
  address?: string;
  /** ZIP + city */
  city?: string;
  /** Austrian VAT ID (UID-Nummer) */
  vatNumber?: string | null;
  /** Custom receipt footer text */
  receiptFooter?: string | null;
  /** Printer IP (for network printers) */
  printerIp?: string | null;
  /** Printer port (for network printers) */
  printerPort?: number | null;
  /** Logo as Base64 data URL */
  logoBase64?: string | null;
}

// ============================================================
// PRINT JOB
// ============================================================

/** Status of a print job */
export type PrintJobStatus = 'pending' | 'printing' | 'done' | 'error';

/** A print job record */
export interface PrintJob {
  id: string;
  tenantId: string;
  receiptId: string;
  status: PrintJobStatus;
  createdAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}
