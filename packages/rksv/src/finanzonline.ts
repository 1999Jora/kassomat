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

import axios, { type AxiosInstance } from 'axios';
import type { Receipt, RKSVData } from '@kassomat/types';

/** FinanzOnline API Basis-URL */
const FINANZONLINE_BASE_URL = 'https://finanzonline.bmf.gv.at/fon/';

/** Timeout für FinanzOnline Anfragen: 30 Sekunden */
const TIMEOUT_MS = 30_000;

/** FinanzOnline Kassen-Anmeldung Request */
interface RegisterRequest {
  /** Umsatzsteuer-Identifikationsnummer des Unternehmens */
  USt_IdNr: string;
  /** Eindeutige Kassen-ID */
  Registrierkassenidentifikationsnummer: string;
  /** Seriennummer des Signaturzertifikats */
  Zertifikatsseriennummer: string;
  /** Art des Sicherheitseinrichtungsausfalles */
  Benennung_der_Sicherheitseinrichtung: string;
}

/** FinanzOnline Startbeleg Request */
interface StartReceiptRequest {
  Registrierkassenidentifikationsnummer: string;
  Belegnummer: string;
  Belegdatum: string;
  Signaturwert: string;
  Sig_Voriger_Beleg: string;
  Zertifikatsseriennummer: string;
}

/** FinanzOnline API Response */
interface FinanzOnlineResponse {
  Ergebnis: 'OK' | 'ERR';
  Fehlermeldung?: string;
  Fehlercode?: string;
}

/** Fehler beim FinanzOnline API Aufruf */
export class FinanzOnlineError extends Error {
  readonly code: string | undefined;
  override readonly cause: unknown;

  constructor(message: string, code?: string, cause?: unknown) {
    super(message);
    this.name = FinanzOnlineError.name;
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Holt FinanzOnline Zugangsdaten aus Umgebungsvariablen.
 * Gibt null zurück wenn nicht konfiguriert.
 */
function getCredentials(): { teilnehmerId: string; benutzerId: string; pin: string } | null {
  const teilnehmerId = process.env['FINANZONLINE_TEILNEHMER_ID'];
  const benutzerId = process.env['FINANZONLINE_BENUTZER_ID'];
  const pin = process.env['FINANZONLINE_PIN'];

  if (!teilnehmerId || !benutzerId || !pin) {
    return null;
  }

  return { teilnehmerId, benutzerId, pin };
}

/** FinanzOnline REST API Client */
export class FinanzOnlineClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: FINANZONLINE_BASE_URL,
      timeout: TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Kasse bei FinanzOnline anmelden (einmalig bei Inbetriebnahme).
   *
   * Voraussetzungen:
   * - Gültiges A-Trust Signaturzertifikat
   * - Registrierte FinanzOnline Zugangsdaten
   * - Österreichische Umsatzsteuer-ID
   */
  async registerCashRegister(params: {
    tenantVatNumber: string;
    cashRegisterId: string;
    certificateSerial: string;
  }): Promise<{ success: boolean; message: string }> {
    const credentials = getCredentials();
    if (!credentials) {
      return {
        success: false,
        message: 'FinanzOnline Zugangsdaten nicht konfiguriert. ' +
          'Bitte FINANZONLINE_TEILNEHMER_ID, FINANZONLINE_BENUTZER_ID und ' +
          'FINANZONLINE_PIN als Umgebungsvariablen setzen.',
      };
    }

    const requestData: RegisterRequest = {
      USt_IdNr: params.tenantVatNumber,
      Registrierkassenidentifikationsnummer: params.cashRegisterId,
      Zertifikatsseriennummer: params.certificateSerial,
      Benennung_der_Sicherheitseinrichtung: 'A-Trust Cloud HSM',
    };

    try {
      const response = await this.http.post<FinanzOnlineResponse>(
        'RK/RKAnmeldung',
        requestData,
        {
          headers: this.buildAuthHeaders(credentials),
        },
      );

      if (response.data.Ergebnis === 'OK') {
        return {
          success: true,
          message: `Kasse ${params.cashRegisterId} erfolgreich bei FinanzOnline angemeldet.`,
        };
      }

      return {
        success: false,
        message: response.data.Fehlermeldung ?? 'Unbekannter FinanzOnline Fehler',
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const body = error.response.data as Partial<FinanzOnlineResponse>;
        throw new FinanzOnlineError(
          `FinanzOnline Anmeldung fehlgeschlagen (HTTP ${status}): ${body.Fehlermeldung ?? 'Unbekannt'}`,
          body.Fehlercode,
          error,
        );
      }
      throw new FinanzOnlineError(
        'FinanzOnline nicht erreichbar',
        'NETWORK_ERROR',
        error,
      );
    }
  }

  /**
   * Startbeleg bei FinanzOnline einreichen.
   *
   * Muss innerhalb von 1 Monat nach Inbetriebnahme eingereicht werden.
   * Jahresbelege: innerhalb von 1 Monat nach Erstellung.
   */
  async submitStartReceipt(
    receipt: Receipt,
    rksv: RKSVData,
  ): Promise<boolean> {
    const credentials = getCredentials();
    if (!credentials) {
      // Keine Credentials: Einreichung als fehlgeschlagen markieren aber nicht werfen
      // (Operator kann es manuell über das FinanzOnline-Portal nachreichen)
      console.warn(
        '[FinanzOnline] Startbeleg konnte nicht eingereicht werden: ' +
        'FinanzOnline Zugangsdaten nicht konfiguriert.',
      );
      return false;
    }

    const requestData: StartReceiptRequest = {
      Registrierkassenidentifikationsnummer: rksv.registrierkasseId,
      Belegnummer: rksv.belegnummer,
      Belegdatum: receipt.createdAt.toISOString(),
      Signaturwert: rksv.signature,
      Sig_Voriger_Beleg: rksv.previousReceiptHash,
      Zertifikatsseriennummer: rksv.atCertificateSerial,
    };

    try {
      const response = await this.http.post<FinanzOnlineResponse>(
        'RK/Belege',
        requestData,
        {
          headers: this.buildAuthHeaders(credentials),
        },
      );

      return response.data.Ergebnis === 'OK';
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const body = error.response.data as Partial<FinanzOnlineResponse>;
        throw new FinanzOnlineError(
          `Startbeleg Einreichung fehlgeschlagen (HTTP ${status}): ${body.Fehlermeldung ?? 'Unbekannt'}`,
          body.Fehlercode,
          error,
        );
      }
      throw new FinanzOnlineError(
        'FinanzOnline nicht erreichbar',
        'NETWORK_ERROR',
        error,
      );
    }
  }

  /**
   * Kasse abmelden bei FinanzOnline (Betriebsende / Außerbetriebnahme).
   *
   * Nach Abmeldung sind keine weiteren Signierungen mit dieser Kassen-ID möglich.
   */
  async deregisterCashRegister(cashRegisterId: string): Promise<boolean> {
    const credentials = getCredentials();
    if (!credentials) {
      console.warn(
        '[FinanzOnline] Kassen-Abmeldung konnte nicht durchgeführt werden: ' +
        'FinanzOnline Zugangsdaten nicht konfiguriert.',
      );
      return false;
    }

    try {
      const response = await this.http.post<FinanzOnlineResponse>(
        'RK/RKAbmeldung',
        { Registrierkassenidentifikationsnummer: cashRegisterId },
        {
          headers: this.buildAuthHeaders(credentials),
        },
      );

      return response.data.Ergebnis === 'OK';
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const body = error.response.data as Partial<FinanzOnlineResponse>;
        throw new FinanzOnlineError(
          `Kassen-Abmeldung fehlgeschlagen (HTTP ${status}): ${body.Fehlermeldung ?? 'Unbekannt'}`,
          body.Fehlercode,
          error,
        );
      }
      throw new FinanzOnlineError(
        'FinanzOnline nicht erreichbar',
        'NETWORK_ERROR',
        error,
      );
    }
  }

  /** Erstellt HTTP-Auth-Header für FinanzOnline (HTTP Basic Auth) */
  private buildAuthHeaders(credentials: {
    teilnehmerId: string;
    benutzerId: string;
    pin: string;
  }): Record<string, string> {
    // FinanzOnline nutzt Teilnehmer-ID + Benutzer-ID + PIN für Basic Auth
    const authString = `${credentials.teilnehmerId}/${credentials.benutzerId}:${credentials.pin}`;
    const encoded = Buffer.from(authString, 'utf8').toString('base64');
    return {
      'Authorization': `Basic ${encoded}`,
    };
  }
}
