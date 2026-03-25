/**
 * Spezielle RKSV-Belege
 * Startbeleg, Nullbeleg, Monatsbeleg, Jahresbeleg, Trainingsbeleg, Schlussbeleg
 * Alle mit €0 Beträgen — dienen zur RKSV-Compliance
 */

import type { Tenant, Receipt, ReceiptType } from '@kassomat/types';

/** Erstellt eine fortlaufende Belegnummer für Sonderbelege */
function buildReceiptNumber(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, '0')}`;
}

/** Erstellt die Basisstruktur für alle Sonderbelege */
function baseSpecialReceipt(
  tenant: Tenant,
  type: ReceiptType,
  cashRegisterId: string,
): Partial<Receipt> {
  const now = new Date();
  const year = now.getFullYear();

  return {
    tenantId: tenant.id,
    cashRegisterId,
    type,
    status: 'pending',
    createdAt: now,
    channel: 'direct',
    items: [],
    payment: {
      method: 'cash',
      amountPaid: 0,
      change: 0,
      tip: 0,
    },
    totals: {
      subtotalNet: 0,
      vat0: 0,
      vat10: 0,
      vat13: 0,
      vat20: 0,
      totalVat: 0,
      totalGross: 0,
    },
    // receiptNumber wird vom Service gesetzt, hier nur Placeholder
    receiptNumber: buildReceiptNumber(year, 0),
  };
}

/**
 * Startbeleg — erster Bon nach Kassen-Anmeldung bei FinanzOnline.
 * Muss innerhalb von 1 Monat nach Inbetriebnahme bei FinanzOnline eingereicht werden.
 * Alle Beträge: €0
 */
export function createStartReceipt(
  tenant: Tenant,
  cashRegisterId: string,
): Partial<Receipt> {
  return {
    ...baseSpecialReceipt(tenant, 'start_receipt', cashRegisterId),
  };
}

/**
 * Nullbeleg — Testbon mit €0, jederzeit möglich.
 * Dient zur Überprüfung der Signaturkette ohne echten Umsatz.
 */
export function createNullReceipt(tenant: Tenant): Partial<Receipt> {
  return {
    ...baseSpecialReceipt(tenant, 'null_receipt', 'KASSE-01'),
  };
}

/**
 * Trainingsbeleg — Bon für Schulungszwecke.
 * Umsatzzähler-Feld enthält verschlüsseltes "TRA" — kein Effekt auf den echten Umsatzzähler.
 * Alle Beträge: €0
 */
export function createTrainingReceipt(tenant: Tenant): Partial<Receipt> {
  return {
    ...baseSpecialReceipt(tenant, 'training', 'KASSE-01'),
  };
}

/**
 * Schlussbeleg (closing_receipt) — letzter Bon bei Außerbetriebnahme der Kasse.
 * Muss bei FinanzOnline eingereicht werden.
 * Alle Beträge: €0
 *
 * @param tenant - Tenant-Objekt
 * @param cashRegisterId - Kassen-ID die außer Betrieb genommen wird
 */
export function createClosingReceipt(
  tenant: Tenant,
  cashRegisterId: string,
): Partial<Receipt> {
  return {
    ...baseSpecialReceipt(tenant, 'closing_receipt', cashRegisterId),
  };
}

/**
 * Monatsbeleg — am 1. eines Monats um 00:01 Uhr zu erstellen.
 * Dient zur monatlichen Signaturkettenprüfung.
 * Alle Beträge: €0
 *
 * @param tenant - Tenant-Objekt
 * @param month - Datum des Monats (erster Tag des betreffenden Monats)
 */
export function createMonthReceipt(
  tenant: Tenant,
  month: Date,
): Partial<Receipt> {
  const timestamp = new Date(month);
  timestamp.setDate(1);
  timestamp.setHours(0, 1, 0, 0);

  const year = timestamp.getFullYear();

  const base = baseSpecialReceipt(tenant, 'month_receipt', 'KASSE-01');
  return {
    ...base,
    createdAt: timestamp,
    receiptNumber: buildReceiptNumber(year, 0),
  };
}

/**
 * Jahresbeleg — am 01.01. um 00:01 Uhr (ersetzt den Monatsbeleg für Januar).
 * Muss innerhalb von 1 Monat bei FinanzOnline eingereicht werden.
 * Alle Beträge: €0
 *
 * @param tenant - Tenant-Objekt
 * @param year - Jahreszahl (z.B. 2025)
 */
export function createYearReceipt(
  tenant: Tenant,
  year: number,
): Partial<Receipt> {
  const timestamp = new Date(year, 0, 1, 0, 1, 0, 0);

  const base = baseSpecialReceipt(tenant, 'year_receipt', 'KASSE-01');
  return {
    ...base,
    createdAt: timestamp,
    receiptNumber: buildReceiptNumber(year, 0),
  };
}
