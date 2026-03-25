/**
 * DEP (Datenerfassungsprotokoll) Builder
 * BMF-Spezifikation: Bundesministerium für Finanzen
 * 7 Jahre Aufbewahrungspflicht gemäß § 132 BAO
 */

import { writeFile } from 'fs/promises';
import { createCipheriv, createHash } from 'crypto';
import type { Receipt, RKSVData, DEPExport, DEPBelegeGruppe } from '@kassomat/types';

/** Kompakte RKSV-Daten für einen Bon (als JSON-String in Belege-kompakt) */
interface KompakterBeleg {
  Registrierkassenidentifikationsnummer: string;
  Belegnummer: string;
  Belegdatum: string;
  Betrag: number;
  Umsatz_Normal: number;         // 20% MwSt
  Umsatz_Ermaessigt_1: number;   // 10% MwSt
  Umsatz_Ermaessigt_2: number;   // 13% MwSt (Gastronomie-Sondersatz)
  Umsatz_Besonders: number;      // Sonstige Steuersätze
  Umsatz_Null: number;           // 0% MwSt
  Verschluesselter_Umsatzzaehler: string;  // AES-256-ICM, Base64
  Zertifikatsseriennummer: string;
  Sig_Voriger_Beleg: string;
  Signaturwert: string;
}

/**
 * Verschlüsselt den kumulierten Umsatzzähler mit AES-256-ICM (= CTR mode).
 *
 * RKSV-Spec:
 * - IV = erste 16 Bytes von SHA-256(KassenID || Belegnummer)
 * - Plaintext = 16-Byte Big-Endian Darstellung des Umsatzzählers in Cent
 * - Algorithmus: AES-256-CTR (Node.js crypto)
 *
 * Für Storno-Belege: encryptSpecialMarker('STO', kassenId, belegnummer, key)
 * Für Trainings-Belege: encryptSpecialMarker('TRA', kassenId, belegnummer, key)
 */
export function encryptUmsatzzaehler(
  sumCents: number,
  kassenId: string,
  belegnummer: string,
  aesKey: Buffer,
): string {
  const iv = buildUmsatzzaehlerIV(kassenId, belegnummer);

  // 16-Byte Big-Endian Darstellung des Umsatzzählers
  const plaintext = Buffer.alloc(16, 0);
  // Schreibe als signed 64-bit Big-Endian in die letzten 8 Bytes
  // (Umsatz kann negativ sein bei Storno-Ketten)
  const big = BigInt(sumCents);
  plaintext.writeBigInt64BE(big, 8);

  const cipher = createCipheriv('aes-256-ctr', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return encrypted.toString('base64');
}

/**
 * Verschlüsselt einen Sonder-Marker (STO / TRA) für Storno- und Trainings-Belege.
 * Der Marker wird als UTF-8 codiert und dann AES-256-CTR verschlüsselt.
 */
export function encryptSpecialMarker(
  marker: 'STO' | 'TRA',
  kassenId: string,
  belegnummer: string,
  aesKey: Buffer,
): string {
  const iv = buildUmsatzzaehlerIV(kassenId, belegnummer);
  const plaintext = Buffer.from(marker, 'utf8');
  const cipher = createCipheriv('aes-256-ctr', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return encrypted.toString('base64');
}

/** IV = erste 16 Bytes von SHA-256(KassenID || Belegnummer) */
function buildUmsatzzaehlerIV(kassenId: string, belegnummer: string): Buffer {
  const hash = createHash('sha256')
    .update(kassenId, 'utf8')
    .update(belegnummer, 'utf8')
    .digest();
  return hash.subarray(0, 16);
}

/** DEP Builder nach BMF-Spezifikation */
export class DEPBuilder {
  /** Zertifikats-basierte Gruppierung: Map<certificateSerial => gruppe> */
  private readonly gruppen = new Map<string, {
    certSerial: string;
    belegeKompakt: string[];
  }>();

  /**
   * Bon ins DEP-Format hinzufügen.
   * Belege werden nach Signaturzertifikat gruppiert.
   */
  addReceipt(receipt: Receipt, rksv: RKSVData): void {
    const certSerial = rksv.atCertificateSerial;

    if (!this.gruppen.has(certSerial)) {
      this.gruppen.set(certSerial, {
        certSerial,
        belegeKompakt: [],
      });
    }

    const gruppe = this.gruppen.get(certSerial)!;
    const kompakt = this.buildKompakterBeleg(receipt, rksv);
    gruppe.belegeKompakt.push(JSON.stringify(kompakt));
  }

  /**
   * DEP als Objekt exportieren (BMF-Spec Format)
   */
  export(): DEPExport {
    const belegeGruppen: DEPBelegeGruppe[] = [];

    for (const gruppe of this.gruppen.values()) {
      belegeGruppen.push({
        // Zertifikat als Base64-kodierter String (Serial-Nummer als Platzhalter)
        // In der Praxis wäre hier das DER-kodierte X.509-Zertifikat als Base64
        Signaturzertifikat: Buffer.from(gruppe.certSerial, 'utf8').toString('base64'),
        Zertifizierungsstellen: ['A-Trust'],
        'Belege-kompakt': gruppe.belegeKompakt,
      });
    }

    return {
      'Belege-Gruppe': belegeGruppen,
    };
  }

  /**
   * DEP als JSON-Datei speichern
   */
  async exportToFile(path: string): Promise<void> {
    const depData = this.export();
    const json = JSON.stringify(depData, null, 2);
    await writeFile(path, json, 'utf8');
  }

  /** Erstellt den kompakten Beleg nach BMF-Format */
  private buildKompakterBeleg(receipt: Receipt, rksv: RKSVData): KompakterBeleg {
    const centsToEuro = (cents: number): number => Math.round(cents) / 100;

    // Verschlüsselter Umsatzzähler — entweder aus rksv-Objekt oder Fallback
    const verschlUmsatz = rksv.umsatzzaehlerEncrypted ?? Buffer.from(
      String(rksv.barumsatzSumme),
      'utf8',
    ).toString('base64');

    return {
      Registrierkassenidentifikationsnummer: rksv.registrierkasseId,
      Belegnummer: rksv.belegnummer,
      Belegdatum: receipt.createdAt.toISOString(),
      Betrag: centsToEuro(receipt.totals.totalGross),
      Umsatz_Normal: centsToEuro(receipt.totals.vat20),
      Umsatz_Ermaessigt_1: centsToEuro(receipt.totals.vat10),
      Umsatz_Ermaessigt_2: centsToEuro(receipt.totals.vat13 ?? 0),
      Umsatz_Besonders: 0,
      Umsatz_Null: centsToEuro(receipt.totals.vat0),
      Verschluesselter_Umsatzzaehler: verschlUmsatz,
      Zertifikatsseriennummer: rksv.atCertificateSerial,
      Sig_Voriger_Beleg: rksv.previousReceiptHash,
      Signaturwert: rksv.signature,
    };
  }
}

/**
 * Erstellt einen DEP-Export für eine Liste von Bons mit den zugehörigen RKSV-Daten.
 * Hilfsfunktion für den häufigen Use-Case.
 */
export function buildDEPExport(
  entries: Array<{ receipt: Receipt; rksv: RKSVData }>,
): DEPExport {
  const builder = new DEPBuilder();
  for (const { receipt, rksv } of entries) {
    builder.addReceipt(receipt, rksv);
  }
  return builder.export();
}
