// src/chain.ts
import { createHash } from "crypto";
function calculateReceiptHash(receiptNumber, timestamp, totalGross, previousHash, signature) {
  const data = [
    receiptNumber,
    timestamp.toISOString(),
    String(totalGross),
    previousHash,
    signature
  ].join("|");
  return createHash("sha256").update(data, "utf8").digest("hex");
}
function calculateInitialHash() {
  return createHash("sha256").update("", "utf8").digest("hex");
}
function verifyChain(receipts) {
  if (receipts.length === 0) return true;
  const initialHash = calculateInitialHash();
  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    if (!receipt) return false;
    const { rksv } = receipt;
    if (!rksv) return false;
    const expectedPreviousHash = i === 0 ? initialHash : (() => {
      const prev = receipts[i - 1];
      return prev ? prev.rksv.receiptHash : null;
    })();
    if (expectedPreviousHash === null) return false;
    if (rksv.previousReceiptHash !== expectedPreviousHash) return false;
    const expectedHash = calculateReceiptHash(
      rksv.belegnummer,
      receipt.createdAt,
      receipt.totals.totalGross,
      rksv.previousReceiptHash,
      rksv.signature
    );
    if (rksv.receiptHash !== expectedHash) return false;
  }
  return true;
}

// src/atrust.ts
import axios from "axios";
var ATRUST_TEST_URL = "https://hs-abnahme.a-trust.at/openitc/rc150/v3";
var ATRUST_PROD_URL = "https://www.a-trust.at/openitc/rc150/v3";
var MAX_RETRIES = 3;
var BASE_DELAY_MS = 500;
var TIMEOUT_MS = 1e4;
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function backoffDelay(attempt) {
  return BASE_DELAY_MS * Math.pow(2, attempt);
}
function isRetriable(error) {
  if (!axios.isAxiosError(error)) return false;
  const axiosError = error;
  if (!axiosError.response) return true;
  return axiosError.response.status >= 500;
}
var ATrustClient = class {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.environment === "production" ? ATRUST_PROD_URL : ATRUST_TEST_URL;
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: TIMEOUT_MS,
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });
  }
  http;
  baseUrl;
  /**
   * Bon signieren — POST an A-Trust API, gibt Base64-kodierten Signature-String zurück
   * Retry: 3 Versuche mit exponentiellem Backoff bei Netzwerk-Fehlern oder 5xx
   */
  async signReceipt(data) {
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.post("/sign", {
          data: Buffer.from(data, "utf8").toString("base64"),
          certificateSerial: this.config.certificateSerial
        });
        const { signatureValue } = response.data;
        if (!signatureValue) {
          throw new Error("A-Trust API returned empty signature");
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
    throw new ATrustError("A-Trust Signatur fehlgeschlagen", lastError);
  }
  /**
   * Signatur prüfen — gibt true zurück wenn Signatur gültig
   */
  async verifySignature(data, signature) {
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.post("/verify", {
          data: Buffer.from(data, "utf8").toString("base64"),
          signatureValue: signature,
          certificateSerial: this.config.certificateSerial
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
    throw new ATrustError("A-Trust Verifikation fehlgeschlagen", lastError);
  }
  /**
   * Zertifikat-Info abrufen
   */
  async getCertificateInfo() {
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.get(
          `/certificate/${encodeURIComponent(this.config.certificateSerial)}`
        );
        const cert = response.data;
        return {
          serial: cert.serialNumber,
          subject: cert.subjectDistinguishedName,
          issuer: cert.issuerDistinguishedName,
          validFrom: new Date(cert.validFrom),
          validTo: new Date(cert.validTo)
        };
      } catch (error) {
        lastError = error;
        if (!isRetriable(error) || attempt === MAX_RETRIES - 1) {
          break;
        }
        await delay(backoffDelay(attempt));
      }
    }
    throw new ATrustError("A-Trust Zertifikat-Abfrage fehlgeschlagen", lastError);
  }
};
var ATrustError = class _ATrustError extends Error {
  cause;
  constructor(message, cause) {
    super(message);
    this.name = _ATrustError.name;
    this.cause = cause;
  }
};

// src/fiskaltrust.ts
var FISKALTRUST_SANDBOX_URL = "https://api-sandbox-rksv.fiskaltrust.at";
var FISKALTRUST_PROD_URL = "https://api.fiskaltrust.at";
var TIMEOUT_MS2 = 15e3;
var MAX_RETRIES2 = 3;
var BASE_DELAY_MS2 = 500;
function delay2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var FiskaltrustClient = class {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.environment === "production" ? FISKALTRUST_PROD_URL : FISKALTRUST_SANDBOX_URL;
    this.headers = {
      "Content-Type": "application/json",
      cashboxid: config.cashboxId,
      accesstoken: config.accessToken
    };
  }
  baseUrl;
  headers;
  /**
   * Bon signieren — sendet Daten als Base64 an fiskaltrust, gibt SignedDataBase64 zurück.
   * Der Rückgabewert wird als RKSV-Signatur gespeichert.
   */
  async signReceipt(data) {
    const dataBase64 = Buffer.from(data, "utf8").toString("base64");
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS2);
        let response;
        try {
          response = await fetch(`${this.baseUrl}/api/sign`, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ DataBase64: dataBase64 }),
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeout);
        }
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new FiskaltrustError(
            `fiskaltrust API returned ${response.status}: ${text.slice(0, 200)}`
          );
        }
        const json = await response.json();
        const signed = json.SignedDataBase64;
        if (!signed) {
          throw new FiskaltrustError("fiskaltrust API returned empty SignedDataBase64");
        }
        return signed;
      } catch (err) {
        lastError = err;
        if (err instanceof FiskaltrustError) break;
        if (attempt < MAX_RETRIES2 - 1) {
          await delay2(BASE_DELAY_MS2 * Math.pow(2, attempt));
        }
      }
    }
    throw new FiskaltrustError("fiskaltrust Signatur fehlgeschlagen", lastError);
  }
  /**
   * Zertifikat als Base64-String abrufen (für atCertificateSerial Feld).
   */
  async getCertificate() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS2);
    try {
      const response = await fetch(`${this.baseUrl}/api/certificate`, {
        headers: this.headers,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new FiskaltrustError(`fiskaltrust Zertifikat-Abfrage: ${response.status}`);
      }
      const json = await response.json();
      return json.CertificateBase64 ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }
};
var FiskaltrustError = class _FiskaltrustError extends Error {
  cause;
  constructor(message, cause) {
    super(message);
    this.name = _FiskaltrustError.name;
    this.cause = cause;
  }
};

// src/qrcode.ts
import { createHash as createHash2 } from "crypto";
function centsToEuroString(cents) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
function formatDatum(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const formatter = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => {
    const part = parts.find((p) => p.type === type);
    return part ? part.value : "00";
  };
  return `${get("day")}.${get("month")}.${get("year")} ${pad(parseInt(get("hour"), 10))}:${get("minute")}:${get("second")}`;
}
function buildSigVorigerBeleg(prevSignature) {
  const input = prevSignature ?? "";
  const hash = createHash2("sha256").update(input, "base64").digest();
  return hash.subarray(0, 8).toString("base64");
}
function buildQRCodeData(receipt, rksv, umsatzzaehlerEncrypted, sigVorigerBeleg) {
  const kassenId = rksv.registrierkasseId;
  const belegnummer = rksv.belegnummer;
  const datum = formatDatum(receipt.createdAt);
  const totalGross = receipt.totals.totalGross;
  const vat0 = receipt.totals.vat0;
  const vat10 = receipt.totals.vat10;
  const vat13 = receipt.totals.vat13 ?? 0;
  const vat20 = receipt.totals.vat20;
  const totalVat = receipt.totals.totalVat;
  let grossNormal = 0;
  let grossErmaessigt1 = 0;
  let grossErmaessigt2 = 0;
  const grossBesonders = 0;
  let grossNull = 0;
  if (totalVat > 0) {
    grossNormal = vat20 > 0 ? Math.round(totalGross * vat20 / totalVat) : 0;
    grossErmaessigt1 = vat10 > 0 ? Math.round(totalGross * vat10 / totalVat) : 0;
    grossErmaessigt2 = vat13 > 0 ? Math.round(totalGross * vat13 / totalVat) : 0;
    grossNull = vat0 > 0 ? Math.round(totalGross * vat0 / totalVat) : 0;
  } else {
    grossNull = totalGross;
  }
  const sumCheck = grossNormal + grossErmaessigt1 + grossErmaessigt2 + grossBesonders + grossNull;
  grossNormal += totalGross - sumCheck;
  return [
    "_R1-AT0",
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
    rksv.signature
  ].join("_");
}
function parseQRCodeData(qrString) {
  const parts = qrString.split("_");
  if (parts.length < 14) {
    return {};
  }
  return {
    registrierkasseId: parts[2] ?? "",
    belegnummer: parts[3] ?? "",
    umsatzzaehlerEncrypted: parts[10] ?? "",
    atCertificateSerial: parts[11] ?? "",
    signature: parts[13] ?? ""
  };
}

// src/dep.ts
import { writeFile } from "fs/promises";
import { createCipheriv, createHash as createHash3 } from "crypto";
function encryptUmsatzzaehler(sumCents, kassenId, belegnummer, aesKey) {
  const iv = buildUmsatzzaehlerIV(kassenId, belegnummer);
  const plaintext = Buffer.alloc(16, 0);
  const big = BigInt(sumCents);
  plaintext.writeBigInt64BE(big, 8);
  const cipher = createCipheriv("aes-256-ctr", aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return encrypted.toString("base64");
}
function encryptSpecialMarker(marker, kassenId, belegnummer, aesKey) {
  const iv = buildUmsatzzaehlerIV(kassenId, belegnummer);
  const plaintext = Buffer.from(marker, "utf8");
  const cipher = createCipheriv("aes-256-ctr", aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return encrypted.toString("base64");
}
function buildUmsatzzaehlerIV(kassenId, belegnummer) {
  const hash = createHash3("sha256").update(kassenId, "utf8").update(belegnummer, "utf8").digest();
  return hash.subarray(0, 16);
}
var DEPBuilder = class {
  /** Zertifikats-basierte Gruppierung: Map<certificateSerial => gruppe> */
  gruppen = /* @__PURE__ */ new Map();
  /**
   * Bon ins DEP-Format hinzufügen.
   * Belege werden nach Signaturzertifikat gruppiert.
   */
  addReceipt(receipt, rksv) {
    const certSerial = rksv.atCertificateSerial;
    if (!this.gruppen.has(certSerial)) {
      this.gruppen.set(certSerial, {
        certSerial,
        belegeKompakt: []
      });
    }
    const gruppe = this.gruppen.get(certSerial);
    const kompakt = this.buildKompakterBeleg(receipt, rksv);
    gruppe.belegeKompakt.push(JSON.stringify(kompakt));
  }
  /**
   * DEP als Objekt exportieren (BMF-Spec Format)
   */
  export() {
    const belegeGruppen = [];
    for (const gruppe of this.gruppen.values()) {
      belegeGruppen.push({
        // Zertifikat als Base64-kodierter String (Serial-Nummer als Platzhalter)
        // In der Praxis wäre hier das DER-kodierte X.509-Zertifikat als Base64
        Signaturzertifikat: Buffer.from(gruppe.certSerial, "utf8").toString("base64"),
        Zertifizierungsstellen: ["A-Trust"],
        "Belege-kompakt": gruppe.belegeKompakt
      });
    }
    return {
      "Belege-Gruppe": belegeGruppen
    };
  }
  /**
   * DEP als JSON-Datei speichern
   */
  async exportToFile(path) {
    const depData = this.export();
    const json = JSON.stringify(depData, null, 2);
    await writeFile(path, json, "utf8");
  }
  /** Erstellt den kompakten Beleg nach BMF-Format */
  buildKompakterBeleg(receipt, rksv) {
    const centsToEuro = (cents) => Math.round(cents) / 100;
    const verschlUmsatz = rksv.umsatzzaehlerEncrypted ?? Buffer.from(
      String(rksv.barumsatzSumme),
      "utf8"
    ).toString("base64");
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
      Signaturwert: rksv.signature
    };
  }
};
function buildDEPExport(entries) {
  const builder = new DEPBuilder();
  for (const { receipt, rksv } of entries) {
    builder.addReceipt(receipt, rksv);
  }
  return builder.export();
}

// src/special-receipts.ts
function buildReceiptNumber(year, sequence) {
  return `${year}-${String(sequence).padStart(6, "0")}`;
}
function baseSpecialReceipt(tenant, type, cashRegisterId) {
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  return {
    tenantId: tenant.id,
    cashRegisterId,
    type,
    status: "pending",
    createdAt: now,
    channel: "direct",
    items: [],
    payment: {
      method: "cash",
      amountPaid: 0,
      change: 0,
      tip: 0
    },
    totals: {
      subtotalNet: 0,
      vat0: 0,
      vat10: 0,
      vat13: 0,
      vat20: 0,
      totalVat: 0,
      totalGross: 0
    },
    // receiptNumber wird vom Service gesetzt, hier nur Placeholder
    receiptNumber: buildReceiptNumber(year, 0)
  };
}
function createStartReceipt(tenant, cashRegisterId) {
  return {
    ...baseSpecialReceipt(tenant, "start_receipt", cashRegisterId)
  };
}
function createNullReceipt(tenant) {
  return {
    ...baseSpecialReceipt(tenant, "null_receipt", "KASSE-01")
  };
}
function createTrainingReceipt(tenant) {
  return {
    ...baseSpecialReceipt(tenant, "training", "KASSE-01")
  };
}
function createClosingReceipt(tenant, cashRegisterId) {
  return {
    ...baseSpecialReceipt(tenant, "closing_receipt", cashRegisterId)
  };
}
function createMonthReceipt(tenant, month) {
  const timestamp = new Date(month);
  timestamp.setDate(1);
  timestamp.setHours(0, 1, 0, 0);
  const year = timestamp.getFullYear();
  const base = baseSpecialReceipt(tenant, "month_receipt", "KASSE-01");
  return {
    ...base,
    createdAt: timestamp,
    receiptNumber: buildReceiptNumber(year, 0)
  };
}
function createYearReceipt(tenant, year) {
  const timestamp = new Date(year, 0, 1, 0, 1, 0, 0);
  const base = baseSpecialReceipt(tenant, "year_receipt", "KASSE-01");
  return {
    ...base,
    createdAt: timestamp,
    receiptNumber: buildReceiptNumber(year, 0)
  };
}

// src/finanzonline.ts
import axios2 from "axios";
var FINANZONLINE_BASE_URL = "https://finanzonline.bmf.gv.at/fon/";
var TIMEOUT_MS3 = 3e4;
var FinanzOnlineError = class _FinanzOnlineError extends Error {
  code;
  cause;
  constructor(message, code, cause) {
    super(message);
    this.name = _FinanzOnlineError.name;
    this.code = code;
    this.cause = cause;
  }
};
function getCredentials() {
  const teilnehmerId = process.env["FINANZONLINE_TEILNEHMER_ID"];
  const benutzerId = process.env["FINANZONLINE_BENUTZER_ID"];
  const pin = process.env["FINANZONLINE_PIN"];
  if (!teilnehmerId || !benutzerId || !pin) {
    return null;
  }
  return { teilnehmerId, benutzerId, pin };
}
var FinanzOnlineClient = class {
  http;
  constructor() {
    this.http = axios2.create({
      baseURL: FINANZONLINE_BASE_URL,
      timeout: TIMEOUT_MS3,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
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
  async registerCashRegister(params) {
    const credentials = getCredentials();
    if (!credentials) {
      return {
        success: false,
        message: "FinanzOnline Zugangsdaten nicht konfiguriert. Bitte FINANZONLINE_TEILNEHMER_ID, FINANZONLINE_BENUTZER_ID und FINANZONLINE_PIN als Umgebungsvariablen setzen."
      };
    }
    const requestData = {
      USt_IdNr: params.tenantVatNumber,
      Registrierkassenidentifikationsnummer: params.cashRegisterId,
      Zertifikatsseriennummer: params.certificateSerial,
      Benennung_der_Sicherheitseinrichtung: "A-Trust Cloud HSM"
    };
    try {
      const response = await this.http.post(
        "RK/RKAnmeldung",
        requestData,
        {
          headers: this.buildAuthHeaders(credentials)
        }
      );
      if (response.data.Ergebnis === "OK") {
        return {
          success: true,
          message: `Kasse ${params.cashRegisterId} erfolgreich bei FinanzOnline angemeldet.`
        };
      }
      return {
        success: false,
        message: response.data.Fehlermeldung ?? "Unbekannter FinanzOnline Fehler"
      };
    } catch (error) {
      if (axios2.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const body = error.response.data;
        throw new FinanzOnlineError(
          `FinanzOnline Anmeldung fehlgeschlagen (HTTP ${status}): ${body.Fehlermeldung ?? "Unbekannt"}`,
          body.Fehlercode,
          error
        );
      }
      throw new FinanzOnlineError(
        "FinanzOnline nicht erreichbar",
        "NETWORK_ERROR",
        error
      );
    }
  }
  /**
   * Startbeleg bei FinanzOnline einreichen.
   *
   * Muss innerhalb von 1 Monat nach Inbetriebnahme eingereicht werden.
   * Jahresbelege: innerhalb von 1 Monat nach Erstellung.
   */
  async submitStartReceipt(receipt, rksv) {
    const credentials = getCredentials();
    if (!credentials) {
      console.warn(
        "[FinanzOnline] Startbeleg konnte nicht eingereicht werden: FinanzOnline Zugangsdaten nicht konfiguriert."
      );
      return false;
    }
    const requestData = {
      Registrierkassenidentifikationsnummer: rksv.registrierkasseId,
      Belegnummer: rksv.belegnummer,
      Belegdatum: receipt.createdAt.toISOString(),
      Signaturwert: rksv.signature,
      Sig_Voriger_Beleg: rksv.previousReceiptHash,
      Zertifikatsseriennummer: rksv.atCertificateSerial
    };
    try {
      const response = await this.http.post(
        "RK/Belege",
        requestData,
        {
          headers: this.buildAuthHeaders(credentials)
        }
      );
      return response.data.Ergebnis === "OK";
    } catch (error) {
      if (axios2.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const body = error.response.data;
        throw new FinanzOnlineError(
          `Startbeleg Einreichung fehlgeschlagen (HTTP ${status}): ${body.Fehlermeldung ?? "Unbekannt"}`,
          body.Fehlercode,
          error
        );
      }
      throw new FinanzOnlineError(
        "FinanzOnline nicht erreichbar",
        "NETWORK_ERROR",
        error
      );
    }
  }
  /**
   * Kasse abmelden bei FinanzOnline (Betriebsende / Außerbetriebnahme).
   *
   * Nach Abmeldung sind keine weiteren Signierungen mit dieser Kassen-ID möglich.
   */
  async deregisterCashRegister(cashRegisterId) {
    const credentials = getCredentials();
    if (!credentials) {
      console.warn(
        "[FinanzOnline] Kassen-Abmeldung konnte nicht durchgef\xFChrt werden: FinanzOnline Zugangsdaten nicht konfiguriert."
      );
      return false;
    }
    try {
      const response = await this.http.post(
        "RK/RKAbmeldung",
        { Registrierkassenidentifikationsnummer: cashRegisterId },
        {
          headers: this.buildAuthHeaders(credentials)
        }
      );
      return response.data.Ergebnis === "OK";
    } catch (error) {
      if (axios2.isAxiosError(error) && error.response) {
        const status = error.response.status;
        const body = error.response.data;
        throw new FinanzOnlineError(
          `Kassen-Abmeldung fehlgeschlagen (HTTP ${status}): ${body.Fehlermeldung ?? "Unbekannt"}`,
          body.Fehlercode,
          error
        );
      }
      throw new FinanzOnlineError(
        "FinanzOnline nicht erreichbar",
        "NETWORK_ERROR",
        error
      );
    }
  }
  /** Erstellt HTTP-Auth-Header für FinanzOnline (HTTP Basic Auth) */
  buildAuthHeaders(credentials) {
    const authString = `${credentials.teilnehmerId}/${credentials.benutzerId}:${credentials.pin}`;
    const encoded = Buffer.from(authString, "utf8").toString("base64");
    return {
      "Authorization": `Basic ${encoded}`
    };
  }
};
export {
  ATrustClient,
  ATrustError,
  DEPBuilder,
  FinanzOnlineClient,
  FinanzOnlineError,
  FiskaltrustClient,
  FiskaltrustError,
  buildDEPExport,
  buildQRCodeData,
  buildSigVorigerBeleg,
  calculateInitialHash,
  calculateReceiptHash,
  createClosingReceipt,
  createMonthReceipt,
  createNullReceipt,
  createStartReceipt,
  createTrainingReceipt,
  createYearReceipt,
  encryptSpecialMarker,
  encryptUmsatzzaehler,
  parseQRCodeData,
  verifyChain
};
