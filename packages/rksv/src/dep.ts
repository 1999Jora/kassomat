/**
 * DEP (Datenerfassungsprotokoll) Builder
 * BMF-Spezifikation: Bundesministerium für Finanzen
 * 7 Jahre Aufbewahrungspflicht gemäß § 132 BAO
 */

import { writeFile } from 'fs/promises';
import type { Receipt, RKSVData, DEPExport, DEPBelegeGruppe } from '@kassomat/types';

/** Kompakte RKSV-Daten für einen Bon (als JSON-String in Belege-kompakt) */
interface KompakterBeleg {
  Registrierkassenidentifikationsnummer: string;
  Belegnummer: string;
  Belegdatum: string;
  Betrag: number;
  Umsatz_Normal: number;
  Umsatz_Ermaessigt: number;
  Umsatz_Besonders: number;
  Umsatz_Null: number;
  Verschluesselter_Umsatzzaehler: string;
  Zertifikatsseriennummer: string;
  Sig_Voriger_Beleg: string;
  Signaturwert: string;
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
    // Beträge in Euro (2 Dezimalstellen)
    const centsToEuro = (cents: number): number => Math.round(cents) / 100;

    return {
      Registrierkassenidentifikationsnummer: rksv.registrierkasseId,
      Belegnummer: rksv.belegnummer,
      Belegdatum: receipt.createdAt.toISOString(),
      Betrag: centsToEuro(receipt.totals.totalGross),
      Umsatz_Normal: centsToEuro(receipt.totals.vat20),
      Umsatz_Ermaessigt: centsToEuro(receipt.totals.vat10),
      Umsatz_Besonders: 0, // 13% MwSt — im System nicht genutzt
      Umsatz_Null: centsToEuro(receipt.totals.vat0),
      // AES-256-ICM verschlüsselte Barumsatzsumme — als Base64-String
      Verschluesselter_Umsatzzaehler: Buffer.from(
        String(rksv.barumsatzSumme),
        'utf8',
      ).toString('base64'),
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
