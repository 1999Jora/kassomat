/**
 * A-Trust Cloud HSM Integration
 * REST-Client für A-Trust openITC RKSV-Signatur-Service
 * Retry-Logik: 3 Versuche mit exponentiellem Backoff
 * Timeout: 10 Sekunden
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { ATrustConfig } from '@kassomat/types';

export interface CertificateInfo {
  serial: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
}

/** A-Trust API Antwort für Signatur */
interface ATrustSignResponse {
  signatureValue: string;
  signatureAlgorithm?: string;
}

/** A-Trust API Antwort für Verifikation */
interface ATrustVerifyResponse {
  isValid: boolean;
  message?: string;
}

/** A-Trust API Antwort für Zertifikat-Info */
interface ATrustCertResponse {
  serialNumber: string;
  subjectDistinguishedName: string;
  issuerDistinguishedName: string;
  validFrom: string;
  validTo: string;
}

const ATRUST_TEST_URL = 'https://hs-abnahme.a-trust.at/openitc/rc150/v3';
const ATRUST_PROD_URL = 'https://www.a-trust.at/openitc/rc150/v3';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const TIMEOUT_MS = 10_000;

/** Wartet für eine bestimmte Anzahl Millisekunden */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Berechnet exponentiellen Backoff: 500ms, 1000ms, 2000ms */
function backoffDelay(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

/** Prüft ob ein Fehler retriable ist (Netzwerk-Fehler oder 5xx) */
function isRetriable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const axiosError = error as AxiosError;
  // Netzwerk-Fehler (kein Response) oder Server-Fehler (5xx)
  if (!axiosError.response) return true;
  return axiosError.response.status >= 500;
}

/** A-Trust Cloud HSM Client für RKSV-Signaturen */
export class ATrustClient {
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(private readonly config: ATrustConfig) {
    this.baseUrl = config.environment === 'production' ? ATRUST_PROD_URL : ATRUST_TEST_URL;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: TIMEOUT_MS,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Bon signieren — POST an A-Trust API, gibt Base64-kodierten Signature-String zurück
   * Retry: 3 Versuche mit exponentiellem Backoff bei Netzwerk-Fehlern oder 5xx
   */
  async signReceipt(data: string): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.post<ATrustSignResponse>('/sign', {
          data: Buffer.from(data, 'utf8').toString('base64'),
          certificateSerial: this.config.certificateSerial,
        });

        const { signatureValue } = response.data;
        if (!signatureValue) {
          throw new Error('A-Trust API returned empty signature');
        }
        return signatureValue;
      } catch (error) {
        lastError = error;
        if (!isRetriable(error) || attempt === MAX_RETRIES - 1) {
          break;
        }
        await delay(backoffDelay(attempt));
      }
    }

    throw new ATrustError('A-Trust Signatur fehlgeschlagen', lastError);
  }

  /**
   * Signatur prüfen — gibt true zurück wenn Signatur gültig
   */
  async verifySignature(data: string, signature: string): Promise<boolean> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.post<ATrustVerifyResponse>('/verify', {
          data: Buffer.from(data, 'utf8').toString('base64'),
          signatureValue: signature,
          certificateSerial: this.config.certificateSerial,
        });

        return response.data.isValid === true;
      } catch (error) {
        lastError = error;
        if (!isRetriable(error) || attempt === MAX_RETRIES - 1) {
          break;
        }
        await delay(backoffDelay(attempt));
      }
    }

    throw new ATrustError('A-Trust Verifikation fehlgeschlagen', lastError);
  }

  /**
   * Zertifikat-Info abrufen
   */
  async getCertificateInfo(): Promise<CertificateInfo> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.get<ATrustCertResponse>(
          `/certificate/${encodeURIComponent(this.config.certificateSerial)}`,
        );

        const cert = response.data;
        return {
          serial: cert.serialNumber,
          subject: cert.subjectDistinguishedName,
          issuer: cert.issuerDistinguishedName,
          validFrom: new Date(cert.validFrom),
          validTo: new Date(cert.validTo),
        };
      } catch (error) {
        lastError = error;
        if (!isRetriable(error) || attempt === MAX_RETRIES - 1) {
          break;
        }
        await delay(backoffDelay(attempt));
      }
    }

    throw new ATrustError('A-Trust Zertifikat-Abfrage fehlgeschlagen', lastError);
  }
}

/** Fehler beim A-Trust API Aufruf */
export class ATrustError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = ATrustError.name;
    this.cause = cause;
  }
}
