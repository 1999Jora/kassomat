/**
 * RKSV Hash-Chaining
 * SHA-256 basierte Hash-Kette nach Registrierkassensicherheitsverordnung
 */

import { createHash } from 'crypto';
import type { Receipt } from '@kassomat/types';

/**
 * Berechnet den SHA-256 Hash eines Bons nach RKSV-Spec.
 * Format: SHA256(receiptNumber + "|" + timestamp.toISOString() + "|" + totalGross + "|" + previousHash + "|" + signature)
 */
export function calculateReceiptHash(
  receiptNumber: string,
  timestamp: Date,
  totalGross: number,
  previousHash: string,
  signature: string,
): string {
  const data = [
    receiptNumber,
    timestamp.toISOString(),
    String(totalGross),
    previousHash,
    signature,
  ].join('|');

  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Berechnet den initialen "Null-Hash" für den ersten Bon.
 * Gemäß RKSV-Spec: SHA256("") — SHA-256 Hash des leeren Strings
 */
export function calculateInitialHash(): string {
  return createHash('sha256').update('', 'utf8').digest('hex');
}

/**
 * Verifiziert die gesamte Hash-Kette aller Bons.
 * Gibt false zurück wenn ein Bon manipuliert wurde.
 * - Der erste Bon muss previousReceiptHash === SHA256("") haben
 * - Jeder folgende Bon muss previousReceiptHash === receiptHash des Vorgängers haben
 */
export function verifyChain(receipts: Receipt[]): boolean {
  if (receipts.length === 0) return true;

  const initialHash = calculateInitialHash();

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    if (!receipt) return false;

    const { rksv } = receipt;
    if (!rksv) return false;

    const expectedPreviousHash = i === 0
      ? initialHash
      : (() => {
          const prev = receipts[i - 1];
          return prev ? prev.rksv.receiptHash : null;
        })();

    if (expectedPreviousHash === null) return false;
    if (rksv.previousReceiptHash !== expectedPreviousHash) return false;

    // Verify the receipt's own hash
    const expectedHash = calculateReceiptHash(
      rksv.belegnummer,
      receipt.createdAt,
      receipt.totals.totalGross,
      rksv.previousReceiptHash,
      rksv.signature,
    );

    if (rksv.receiptHash !== expectedHash) return false;
  }

  return true;
}
