/**
 * RKSV QR-Code Daten
 * Format nach Registrierkassensicherheitsverordnung BGBl. II Nr. 410/2015
 *
 * QR-Code Format:
 * _R1-AT0_{KassenID}_{Belegnummer}_{Datum}_{Betrag-Normal}_{Betrag-Ermaessigt}_{Betrag-Besonders}_{Betrag-Null}_{Signatur-Base64-truncated}
 *
 * Datum: dd.MM.yyyy HH:mm:ss
 * Beträge: in Euro mit Komma-Dezimaltrenner (z.B. "14,90")
 */

import type { Receipt, RKSVData } from '@kassomat/types';

/** Konvertiert Cent-Betrag zu Euro-String mit Komma-Dezimaltrenner (z.B. 1490 => "14,90") */
function centsToEuroString(cents: number): string {
  const euros = cents / 100;
  // Immer 2 Dezimalstellen, Punkt durch Komma ersetzen
  return euros.toFixed(2).replace('.', ',');
}

/** Formatiert ein Datum als dd.MM.yyyy HH:mm:ss (Wiener Lokalzeit) */
function formatDatum(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');

  // Explizite Formatierung in Europe/Vienna Zeitzone
  // date-fns-tz ist verfügbar, aber wir nutzen Intl für Einfachheit und Zero-Dependency
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
 * Erstellt den RKSV-konformen QR-Code String.
 *
 * Format: _R1-AT0_{KassenID}_{Belegnummer}_{Datum}_{Betrag-Normal}_{Betrag-Ermaessigt}_{Betrag-Besonders}_{Betrag-Null}_{Signatur-Base64-truncated}
 *
 * Betragsfelder:
 * - Betrag-Normal: 20% MwSt (Normalsatz)
 * - Betrag-Ermaessigt: 10% MwSt (ermäßigter Satz)
 * - Betrag-Besonders: 13% MwSt (besonderer Satz — hier immer 0 da nicht in österreichischer Gastronomie üblich)
 * - Betrag-Null: 0% MwSt (steuerfrei)
 *
 * Die Signatur wird auf die ersten 8 Zeichen (URL-safe Base64) truncated.
 */
export function buildQRCodeData(receipt: Receipt, rksv: RKSVData): string {
  const kassenId = rksv.registrierkasseId;
  const belegnummer = rksv.belegnummer;
  const datum = formatDatum(receipt.createdAt);

  // Beträge nach MwSt-Satz aufgeschlüsselt in Cent, dann zu Euro-Strings konvertiert
  // Die Betragsfelder im QR-Code sind die Brutto-Umsatzanteile nach Steuersatz
  const totalGross = receipt.totals.totalGross;
  const vat0 = receipt.totals.vat0;
  const vat10 = receipt.totals.vat10;
  const vat20 = receipt.totals.vat20;
  const totalVat = receipt.totals.totalVat;

  // Anteilsberechnung: Betrag-Normal = Anteil 20%, Betrag-Ermaessigt = Anteil 10%, etc.
  // Wenn totalVat = 0, dann gesamter Betrag auf Null
  let grossNormal = 0;
  let grossErmaessigt = 0;
  const grossBesonders = 0; // 13% - nicht genutzt
  let grossNull = 0;

  if (totalVat > 0) {
    // Berechne Brutto-Anteile proportional zu den MwSt-Beträgen
    grossNormal = vat20 > 0 ? Math.round(totalGross * vat20 / totalVat) : 0;
    grossErmaessigt = vat10 > 0 ? Math.round(totalGross * vat10 / totalVat) : 0;
    grossNull = vat0 > 0 ? Math.round(totalGross * vat0 / totalVat) : 0;
  } else {
    // Kein MwSt => alles auf Null-Satz
    grossNull = totalGross;
  }

  // Rundungsdifferenz auf Normal-Betrag addieren
  const sumCheck = grossNormal + grossErmaessigt + grossBesonders + grossNull;
  const diff = totalGross - sumCheck;
  grossNormal += diff;

  const betragNormalStr = centsToEuroString(grossNormal);
  const betragErmaessigtStr = centsToEuroString(grossErmaessigt);
  const betragBesondersStr = centsToEuroString(grossBesonders);
  const betragNullStr = centsToEuroString(grossNull);

  // Signatur: erste 8 Zeichen der Base64-kodierten Signatur
  const signaturTruncated = rksv.signature.substring(0, 8);

  return [
    '_R1-AT0',
    kassenId,
    belegnummer,
    datum,
    betragNormalStr,
    betragErmaessigtStr,
    betragBesondersStr,
    betragNullStr,
    signaturTruncated,
  ].join('_');
}

/**
 * Parst einen RKSV QR-Code String und extrahiert die Felder.
 */
export function parseQRCodeData(qrString: string): Partial<RKSVData> {
  // Format: _R1-AT0_{KassenID}_{Belegnummer}_{Datum}_{Betrag-Normal}_{Betrag-Ermaessigt}_{Betrag-Besonders}_{Betrag-Null}_{Signatur}
  // Der erste "_" vor R1 macht das erste split-Element leer
  const parts = qrString.split('_');

  // parts[0] = '' (leer wegen führendem _)
  // parts[1] = 'R1-AT0'
  // parts[2] = KassenID
  // parts[3] = Belegnummer
  // parts[4] = Datum (dd.MM.yyyy HH:mm:ss — aber das Datum enthält kein _, also bleibt es zusammen)
  // parts[5] = Betrag-Normal
  // parts[6] = Betrag-Ermaessigt
  // parts[7] = Betrag-Besonders
  // parts[8] = Betrag-Null
  // parts[9] = Signatur

  if (parts.length < 10) {
    return {};
  }

  // Datum kann Leerzeichen enthalten (dd.MM.yyyy HH:mm:ss)
  // Da das Datum kein _ enthält, ist parts[4] das vollständige Datum
  const kassenId = parts[2] ?? '';
  const belegnummer = parts[3] ?? '';
  const signaturTruncated = parts[9] ?? '';

  return {
    registrierkasseId: kassenId,
    belegnummer,
    signature: signaturTruncated,
  };
}
