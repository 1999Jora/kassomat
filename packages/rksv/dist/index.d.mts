import { Receipt, RKSVData, DEPExport, Tenant } from '@kassomat/types';

/**
 * RKSV Hash-Chaining
 * SHA-256 basierte Hash-Kette nach Registrierkassensicherheitsverordnung
 */

/**
 * Berechnet den SHA-256 Hash eines Bons nach RKSV-Spec.
 * Format: SHA256(receiptNumber + "|" + timestamp.toISOString() + "|" + totalGross + "|" + previousHash + "|" + signature)
 */
declare function calculateReceiptHash(receiptNumber: string, timestamp: Date, totalGross: number, previousHash: string, signature: string): string;
/**
 * Berechnet den initialen "Null-Hash" für den ersten Bon.
 * Gemäß RKSV-Spec: SHA256("") — SHA-256 Hash des leeren Strings
 */
declare function calculateInitialHash(): string;
/**
 * Verifiziert die gesamte Hash-Kette aller Bons.
 * Gibt false zurück wenn ein Bon manipuliert wurde.
 * - Der erste Bon muss previousReceiptHash === SHA256("") haben
 * - Jeder folgende Bon muss previousReceiptHash === receiptHash des Vorgängers haben
 */
declare function verifyChain(receipts: Receipt[]): boolean;

/**
 * A-Trust Cloud HSM Integration
 * REST-Client für A-Trust openITC RKSV-Signatur-Service
 * Retry-Logik: 3 Versuche mit exponentiellem Backoff
 * Timeout: 10 Sekunden
 */
/** Internal config for ATrustClient (includes decrypted apiKey) */
interface ATrustClientConfig {
    certificateSerial: string;
    apiKey: string;
    environment: 'test' | 'production';
}
interface CertificateInfo {
    serial: string;
    subject: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
}
/** A-Trust Cloud HSM Client für RKSV-Signaturen */
declare class ATrustClient {
    private readonly config;
    private readonly http;
    private readonly baseUrl;
    constructor(config: ATrustClientConfig);
    /**
     * Bon signieren — POST an A-Trust API, gibt Base64-kodierten Signature-String zurück
     * Retry: 3 Versuche mit exponentiellem Backoff bei Netzwerk-Fehlern oder 5xx
     */
    signReceipt(data: string): Promise<string>;
    /**
     * Signatur prüfen — gibt true zurück wenn Signatur gültig
     */
    verifySignature(data: string, signature: string): Promise<boolean>;
    /**
     * Zertifikat-Info abrufen
     */
    getCertificateInfo(): Promise<CertificateInfo>;
}
/** Fehler beim A-Trust API Aufruf */
declare class ATrustError extends Error {
    readonly cause: unknown;
    constructor(message: string, cause?: unknown);
}

/**
 * fiskaltrust RKSV Signing Service Client
 *
 * Demo-Client für https://api-sandbox-rksv.fiskaltrust.at
 * Verwendet die RKSV.Sign REST API:
 *   POST /api/sign { DataBase64 } → { SignedDataBase64 }
 *   GET  /api/certificate → { CertificateBase64 }
 *
 * Auth: cashboxid + accesstoken Header
 */
interface FiskaltrustClientConfig {
    cashboxId: string;
    accessToken: string;
    environment: 'sandbox' | 'production';
}
/** fiskaltrust RKSV.Sign REST Client */
declare class FiskaltrustClient {
    private readonly config;
    private readonly baseUrl;
    private readonly headers;
    constructor(config: FiskaltrustClientConfig);
    /**
     * Bon signieren — sendet Daten als Base64 an fiskaltrust, gibt SignedDataBase64 zurück.
     * Der Rückgabewert wird als RKSV-Signatur gespeichert.
     */
    signReceipt(data: string): Promise<string>;
    /**
     * Zertifikat als Base64-String abrufen (für atCertificateSerial Feld).
     */
    getCertificate(): Promise<string>;
}
/** Fehler beim fiskaltrust API Aufruf */
declare class FiskaltrustError extends Error {
    readonly cause: unknown;
    constructor(message: string, cause?: unknown);
}

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

/**
 * Berechnet den Sig-Voriger-Beleg Wert.
 * = BASE64(SHA256(vorherige Signatur)[0:8])
 * Für den ersten Beleg (kein Vorgänger): BASE64(SHA256("")[0:8])
 */
declare function buildSigVorigerBeleg(prevSignature: string | null | undefined): string;
/**
 * Erstellt den vollständigen RKSV-konformen QR-Code String (13 Felder).
 *
 * @param receipt - Bon-Objekt
 * @param rksv - RKSV-Daten inkl. Signatur
 * @param umsatzzaehlerEncrypted - AES-256-ICM verschlüsselter Umsatzzähler (Base64),
 *                                  oder "STO"/"TRA" für Storno/Trainings-Belege
 * @param sigVorigerBeleg - BASE64(SHA256(prevSignature)[0:8])
 */
declare function buildQRCodeData(receipt: Receipt, rksv: RKSVData, umsatzzaehlerEncrypted: string, sigVorigerBeleg: string): string;
/**
 * Parst einen RKSV QR-Code String und extrahiert die Felder.
 */
declare function parseQRCodeData(qrString: string): Partial<RKSVData>;

/**
 * DEP (Datenerfassungsprotokoll) Builder
 * BMF-Spezifikation: Bundesministerium für Finanzen
 * 7 Jahre Aufbewahrungspflicht gemäß § 132 BAO
 */

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
declare function encryptUmsatzzaehler(sumCents: number, kassenId: string, belegnummer: string, aesKey: Buffer): string;
/**
 * Verschlüsselt einen Sonder-Marker (STO / TRA) für Storno- und Trainings-Belege.
 * Der Marker wird als UTF-8 codiert und dann AES-256-CTR verschlüsselt.
 */
declare function encryptSpecialMarker(marker: 'STO' | 'TRA', kassenId: string, belegnummer: string, aesKey: Buffer): string;
/** DEP Builder nach BMF-Spezifikation */
declare class DEPBuilder {
    /** Zertifikats-basierte Gruppierung: Map<certificateSerial => gruppe> */
    private readonly gruppen;
    /**
     * Bon ins DEP-Format hinzufügen.
     * Belege werden nach Signaturzertifikat gruppiert.
     */
    addReceipt(receipt: Receipt, rksv: RKSVData): void;
    /**
     * DEP als Objekt exportieren (BMF-Spec Format)
     */
    export(): DEPExport;
    /**
     * DEP als JSON-Datei speichern
     */
    exportToFile(path: string): Promise<void>;
    /** Erstellt den kompakten Beleg nach BMF-Format */
    private buildKompakterBeleg;
}
/**
 * Erstellt einen DEP-Export für eine Liste von Bons mit den zugehörigen RKSV-Daten.
 * Hilfsfunktion für den häufigen Use-Case.
 */
declare function buildDEPExport(entries: Array<{
    receipt: Receipt;
    rksv: RKSVData;
}>): DEPExport;

/**
 * Spezielle RKSV-Belege
 * Startbeleg, Nullbeleg, Monatsbeleg, Jahresbeleg, Trainingsbeleg, Schlussbeleg
 * Alle mit €0 Beträgen — dienen zur RKSV-Compliance
 */

/**
 * Startbeleg — erster Bon nach Kassen-Anmeldung bei FinanzOnline.
 * Muss innerhalb von 1 Monat nach Inbetriebnahme bei FinanzOnline eingereicht werden.
 * Alle Beträge: €0
 */
declare function createStartReceipt(tenant: Tenant, cashRegisterId: string): Partial<Receipt>;
/**
 * Nullbeleg — Testbon mit €0, jederzeit möglich.
 * Dient zur Überprüfung der Signaturkette ohne echten Umsatz.
 */
declare function createNullReceipt(tenant: Tenant): Partial<Receipt>;
/**
 * Trainingsbeleg — Bon für Schulungszwecke.
 * Umsatzzähler-Feld enthält verschlüsseltes "TRA" — kein Effekt auf den echten Umsatzzähler.
 * Alle Beträge: €0
 */
declare function createTrainingReceipt(tenant: Tenant): Partial<Receipt>;
/**
 * Schlussbeleg (closing_receipt) — letzter Bon bei Außerbetriebnahme der Kasse.
 * Muss bei FinanzOnline eingereicht werden.
 * Alle Beträge: €0
 *
 * @param tenant - Tenant-Objekt
 * @param cashRegisterId - Kassen-ID die außer Betrieb genommen wird
 */
declare function createClosingReceipt(tenant: Tenant, cashRegisterId: string): Partial<Receipt>;
/**
 * Monatsbeleg — am 1. eines Monats um 00:01 Uhr zu erstellen.
 * Dient zur monatlichen Signaturkettenprüfung.
 * Alle Beträge: €0
 *
 * @param tenant - Tenant-Objekt
 * @param month - Datum des Monats (erster Tag des betreffenden Monats)
 */
declare function createMonthReceipt(tenant: Tenant, month: Date): Partial<Receipt>;
/**
 * Jahresbeleg — am 01.01. um 00:01 Uhr (ersetzt den Monatsbeleg für Januar).
 * Muss innerhalb von 1 Monat bei FinanzOnline eingereicht werden.
 * Alle Beträge: €0
 *
 * @param tenant - Tenant-Objekt
 * @param year - Jahreszahl (z.B. 2025)
 */
declare function createYearReceipt(tenant: Tenant, year: number): Partial<Receipt>;

/**
 * FinanzOnline Integration
 * REST API Client für das österreichische Finanzamt-Portal
 *
 * HINWEIS: Die FinanzOnline Web-API erfordert registrierte Zugangsdaten
 * (Teilnehmer-ID, Benutzer-ID, PIN). Diese werden als Umgebungsvariablen
 * konfiguriert. Die API-Aufrufe sind strukturell implementiert, geben aber
 * bei fehlenden Credentials einen konfigurierten Fehler zurück.
 *
 * FinanzOnline REST API Dokumentation:
 * https://www.bmf.gv.at/services/finanzonline.html
 */

/** Fehler beim FinanzOnline API Aufruf */
declare class FinanzOnlineError extends Error {
    readonly code: string | undefined;
    readonly cause: unknown;
    constructor(message: string, code?: string, cause?: unknown);
}
/** FinanzOnline REST API Client */
declare class FinanzOnlineClient {
    private readonly http;
    constructor();
    /**
     * Kasse bei FinanzOnline anmelden (einmalig bei Inbetriebnahme).
     *
     * Voraussetzungen:
     * - Gültiges A-Trust Signaturzertifikat
     * - Registrierte FinanzOnline Zugangsdaten
     * - Österreichische Umsatzsteuer-ID
     */
    registerCashRegister(params: {
        tenantVatNumber: string;
        cashRegisterId: string;
        certificateSerial: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Startbeleg bei FinanzOnline einreichen.
     *
     * Muss innerhalb von 1 Monat nach Inbetriebnahme eingereicht werden.
     * Jahresbelege: innerhalb von 1 Monat nach Erstellung.
     */
    submitStartReceipt(receipt: Receipt, rksv: RKSVData): Promise<boolean>;
    /**
     * Kasse abmelden bei FinanzOnline (Betriebsende / Außerbetriebnahme).
     *
     * Nach Abmeldung sind keine weiteren Signierungen mit dieser Kassen-ID möglich.
     */
    deregisterCashRegister(cashRegisterId: string): Promise<boolean>;
    /** Erstellt HTTP-Auth-Header für FinanzOnline (HTTP Basic Auth) */
    private buildAuthHeaders;
}

export { ATrustClient, ATrustError, type CertificateInfo, DEPBuilder, FinanzOnlineClient, FinanzOnlineError, FiskaltrustClient, type FiskaltrustClientConfig, FiskaltrustError, buildDEPExport, buildQRCodeData, buildSigVorigerBeleg, calculateInitialHash, calculateReceiptHash, createClosingReceipt, createMonthReceipt, createNullReceipt, createStartReceipt, createTrainingReceipt, createYearReceipt, encryptSpecialMarker, encryptUmsatzzaehler, parseQRCodeData, verifyChain };
