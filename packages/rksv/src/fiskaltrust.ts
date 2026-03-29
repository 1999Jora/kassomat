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

const FISKALTRUST_SANDBOX_URL = 'https://api-sandbox-rksv.fiskaltrust.at';
const FISKALTRUST_PROD_URL = 'https://api.fiskaltrust.at';

const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface FiskaltrustSignResponse {
  SignedDataBase64: string;
}

interface FiskaltrustCertResponse {
  CertificateBase64: string;
}

export interface FiskaltrustClientConfig {
  cashboxId: string;
  accessToken: string;
  environment: 'sandbox' | 'production';
}

/** fiskaltrust RKSV.Sign REST Client */
export class FiskaltrustClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: FiskaltrustClientConfig) {
    this.baseUrl =
      config.environment === 'production' ? FISKALTRUST_PROD_URL : FISKALTRUST_SANDBOX_URL;

    this.headers = {
      'Content-Type': 'application/json',
      cashboxid: config.cashboxId,
      accesstoken: config.accessToken,
    };
  }

  /**
   * Bon signieren — sendet Daten als Base64 an fiskaltrust, gibt SignedDataBase64 zurück.
   * Der Rückgabewert wird als RKSV-Signatur gespeichert.
   */
  async signReceipt(data: string): Promise<string> {
    const dataBase64 = Buffer.from(data, 'utf8').toString('base64');
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(`${this.baseUrl}/api/sign`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ DataBase64: dataBase64 }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new FiskaltrustError(
            `fiskaltrust API returned ${response.status}: ${text.slice(0, 200)}`,
          );
        }

        const json = (await response.json()) as FiskaltrustSignResponse;
        const signed = json.SignedDataBase64;
        if (!signed) {
          throw new FiskaltrustError('fiskaltrust API returned empty SignedDataBase64');
        }

        return signed;
      } catch (err) {
        lastError = err;
        // Don't retry on definitive API errors (4xx)
        if (err instanceof FiskaltrustError) break;
        if (attempt < MAX_RETRIES - 1) {
          await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw new FiskaltrustError('fiskaltrust Signatur fehlgeschlagen', lastError);
  }

  /**
   * Zertifikat als Base64-String abrufen (für atCertificateSerial Feld).
   */
  async getCertificate(): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/api/certificate`, {
        headers: this.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new FiskaltrustError(`fiskaltrust Zertifikat-Abfrage: ${response.status}`);
      }

      const json = (await response.json()) as FiskaltrustCertResponse;
      return json.CertificateBase64 ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Fehler beim fiskaltrust API Aufruf */
export class FiskaltrustError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = FiskaltrustError.name;
    this.cause = cause;
  }
}
