/**
 * RKSV QR-Code Daten
 * Format nach Registrierkassensicherheitsverordnung BGBl. II Nr. 410/2015
 *
 * Vollständiges QR-Code Format (13 Felder nach führendem Unterstrich):
 * _R1-AT0_{KassenID}_{Belegnummer}_{Datum}_{Betrag-Normal}_{Betrag-Ermaessigt-1}_{Betrag-Ermaessigt-2}_{Betrag-Besonders}_{Betrag-Null}_{VerschlUmsatzzaehler}_{Zertifikatsseriennummer}_{Sig-Voriger-Beleg}_{Signaturwert}
 *
 * Datum: dd.MM.yyyy HH:mm:ss (Europe/Vienna)
 * Beträge: in Euro mit Komma-Dezimaltrenner (z.B. "14,90")
 * VerschlUmsatzzaehler: AES-256-ICM verschlüsselt, Base64 (oder "STO"/"TRA" für Sonderbelege)
 * Sig-Voriger-Beleg: BASE64(SHA256(prevSignatureValue)[0:8])
 * Signaturwert: vollständige JWS-Signatur (Base64)
 */

import { createHash } from 'crypto';
import type { Receipt, RKSVData } from '@kassomat/types';

/** Konvertiert Cent-Betrag zu Euro-String mit Komma-Dezimaltrenner (z.B. 1490 => "14,90") */
function centsToEuroString(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Formatiert ein Datum als dd.MM.yyyy HH:mm:ss (Wiener Lokalzeit) */
function formatDatum(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');

  const formatter = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string): string => {
    const part = parts.find(p => p.type === type);
    return part ? part.value : '00';
  };

  return `${get('day')}.${get('month')}.${get('year')} ${pad(parseInt(get('hour'), 10))}:${get('minute')}:${get('second')}`;
}

/**
 * Berechnet den Sig-Voriger-Beleg Wert.
 * = BASE64(SHA256(vorherige Signatur)[0:8])
 * Für den ersten Beleg (kein Vorgänger): BASE64(SHA256("")[0:8])
 */
export function buildSigVorigerBeleg(prevSignature: string | null | undefined): string {
  const input = prevSignature ?? '';
  const hash = createHash('sha256').update(input, 'base64').digest();
  return hash.subarray(0, 8).toString('base64');
}

/**
 * Erstellt den vollständigen RKSV-konformen QR-Code String (13 Felder).
 *
 * @param receipt - Bon-Objekt
 * @param rksv - RKSV-Daten inkl. Signatur
 * @param umsatzzaehlerEncrypted - AES-256-ICM verschlüsselter Umsatzzähler (Base64),
 *                                  oder "STO"/"TRA" für Storno/Trainings-Belege
 * @param sigVorigerBeleg - BASE64(SHA256(prevSignature)[0:8])
 */
export function buildQRCodeData(
  receipt: Receipt,
  rksv: RKSVData,
  umsatzzaehlerEncrypted: string,
  sigVorigerBeleg: string,
): string {
  const kassenId = rksv.registrierkasseId;
  const belegnummer = rksv.belegnummer;
  const datum = formatDatum(receipt.createdAt);

  const totalGross = receipt.totals.totalGross;
  const vat0 = receipt.totals.vat0;
  const vat10 = receipt.totals.vat10;
  const vat13 = receipt.totals.vat13 ?? 0;
  const vat20 = receipt.totals.vat20;
  const totalVat = receipt.totals.totalVat;

  // Berechne Brutto-Anteile nach MwSt-Satz
  let grossNormal = 0;       // 20%
  let grossErmaessigt1 = 0;  // 10%
  let grossErmaessigt2 = 0;  // 13%
  const grossBesonders = 0;  // nicht genutzt
  let grossNull = 0;         // 0%

  if (totalVat > 0) {
    grossNormal = vat20 > 0 ? Math.round(totalGross * vat20 / totalVat) : 0;
    grossErmaessigt1 = vat10 > 0 ? Math.round(totalGross * vat10 / totalVat) : 0;
    grossErmaessigt2 = vat13 > 0 ? Math.round(totalGross * vat13 / totalVat) : 0;
    grossNull = vat0 > 0 ? Math.round(totalGross * vat0 / totalVat) : 0;
  } else {
    grossNull = totalGross;
  }

  // Rundungsdifferenz auf Normal-Betrag addieren
  const sumCheck = grossNormal + grossErmaessigt1 + grossErmaessigt2 + grossBesonders + grossNull;
  grossNormal += totalGross - sumCheck;

  return [
    '_R1-AT0',
    kassenId,
    belegnummer,
    datum,
    centsToEuroString(grossNormal),
    centsToEuroString(grossErmaessigt1),
    centsToEuroString(grossErmaessigt2),
    centsToEuroString(grossBesonders),
    centsToEuroString(grossNull),
    umsatzzaehlerEncrypted,
    rksv.atCertificateSerial,
    sigVorigerBeleg,
    rksv.signature,
  ].join('_');
}

/**
 * Parst einen RKSV QR-Code String und extrahiert die Felder.
 */
export function parseQRCodeData(qrString: string): Partial<RKSVData> {
  const parts = qrString.split('_');

  // parts[0]  = '' (leer wegen führendem _)
  // parts[1]  = 'R1-AT0'
  // parts[2]  = KassenID
  // parts[3]  = Belegnummer
  // parts[4]  = Datum (dd.MM.yyyy HH:mm:ss — kein _)
  // parts[5]  = Betrag-Normal (20%)
  // parts[6]  = Betrag-Ermaessigt-1 (10%)
  // parts[7]  = Betrag-Ermaessigt-2 (13%)
  // parts[8]  = Betrag-Besonders
  // parts[9]  = Betrag-Null (0%)
  // parts[10] = VerschlüsselterUmsatzzähler
  // parts[11] = Zertifikatsseriennummer
  // parts[12] = Sig-Voriger-Beleg
  // parts[13] = Signaturwert

  if (parts.length < 14) {
    return {};
  }

  return {
    registrierkasseId: parts[2] ?? '',
    belegnummer: parts[3] ?? '',
    umsatzzaehlerEncrypted: parts[10] ?? '',
    atCertificateSerial: parts[11] ?? '',
    signature: parts[13] ?? '',
  };
}
