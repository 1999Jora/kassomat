/**
 * Synchrone RKSV-Signatur — direkt aufrufbar ohne BullMQ/Redis.
 * Wird von receipts.service.ts nach jeder Bon-Erstellung aufgerufen.
 */

import { randomBytes } from 'crypto';
import {
  ATrustClient,
  ATrustError,
  FiskaltrustClient,
  FiskaltrustError,
  calculateReceiptHash,
  calculateInitialHash,
  buildQRCodeData,
  buildSigVorigerBeleg,
  encryptUmsatzzaehler,
  encryptSpecialMarker,
} from '@kassomat/rksv';
import type { ReceiptType, ReceiptStatus, SalesChannel, VatRate, PaymentMethod, Receipt, RKSVData } from '@kassomat/types';
import { prisma } from './prisma';
import { decrypt, encrypt } from './crypto';

// ── Hilfsfunktionen (aus rksv.worker.ts übernommen) ────────────────────────

async function getPreviousReceiptHash(tenantId: string, currentReceiptId: string): Promise<string> {
  const previous = await prisma.receipt.findFirst({
    where: {
      tenantId,
      id: { not: currentReceiptId },
      rksv_receiptHash: { not: null },
      status: { in: ['signed', 'printed'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { rksv_receiptHash: true },
  });
  return previous?.rksv_receiptHash ?? calculateInitialHash();
}

async function getPreviousSignature(tenantId: string, currentReceiptId: string): Promise<string | null> {
  const previous = await prisma.receipt.findFirst({
    where: {
      tenantId,
      id: { not: currentReceiptId },
      rksv_signature: { not: null },
      status: { in: ['signed', 'printed'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { rksv_signature: true },
  });
  return previous?.rksv_signature ?? null;
}

async function getCumulativeUmsatz(tenantId: string, currentReceiptId: string): Promise<number> {
  const result = await prisma.receipt.aggregate({
    where: {
      tenantId,
      id: { not: currentReceiptId },
      type: { in: ['sale', 'cancellation'] },
      status: { in: ['signed', 'printed'] },
    },
    _sum: { totalGross: true },
  });
  return result._sum.totalGross ?? 0;
}

async function getOrCreateAesKey(tenantId: string): Promise<Buffer> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { rksvAesKey_encrypted: true },
  });

  if (tenant?.rksvAesKey_encrypted) {
    return Buffer.from(decrypt(tenant.rksvAesKey_encrypted), 'hex');
  }

  const newKey = randomBytes(32);
  const encrypted = encrypt(newKey.toString('hex'));
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      rksvAesKey_encrypted: encrypted,
      rksvAesKeyHint: newKey.toString('hex').substring(0, 4) + '...',
    },
  });
  return newKey;
}

// ── Haupt-Funktion ──────────────────────────────────────────────────────────

/**
 * Signiert einen Bon synchron (ohne BullMQ).
 * Fehler werden geloggt aber nicht geworfen — Bon bleibt offline_pending.
 */
export async function signReceiptNow(receiptId: string, tenantId: string): Promise<void> {
  const receipt = await prisma.receipt.findFirst({ where: { id: receiptId, tenantId } });
  if (!receipt) return;
  if (receipt.status === 'signed' || receipt.status === 'printed') return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      rksvEnabled: true,
      atrustCertificateSerial: true,
      atrustApiKey_encrypted: true,
      atrustEnvironment: true,
      fiskaltrustCashboxId: true,
      fiskaltrustAccessToken_encrypted: true,
      fiskaltrustEnvironment: true,
    },
  });

  if (!tenant) return;

  // RKSV deaktiviert → sofort als signiert markieren (Demo)
  if (!tenant.rksvEnabled) {
    await prisma.receipt.update({ where: { id: receiptId }, data: { status: 'signed', rksv_signedAt: new Date() } });
    return;
  }

  const hasAtrust = !!(tenant.atrustCertificateSerial && tenant.atrustApiKey_encrypted);
  const hasFiskaltrust = !!(tenant.fiskaltrustCashboxId && tenant.fiskaltrustAccessToken_encrypted);

  // Kein Signing-Anbieter konfiguriert → Demo-Modus
  if (!hasAtrust && !hasFiskaltrust) {
    await prisma.receipt.update({ where: { id: receiptId }, data: { status: 'signed', rksv_signedAt: new Date() } });
    return;
  }

  // Signing-Client
  let signFn: (data: string) => Promise<string>;
  let certSerial: string;

  if (hasAtrust) {
    const client = new ATrustClient({
      certificateSerial: tenant.atrustCertificateSerial!,
      apiKey: decrypt(tenant.atrustApiKey_encrypted!),
      environment: tenant.atrustEnvironment === 'production' ? 'production' : 'test',
    });
    signFn = (d) => client.signReceipt(d);
    certSerial = tenant.atrustCertificateSerial!;
  } else {
    const client = new FiskaltrustClient({
      cashboxId: tenant.fiskaltrustCashboxId!,
      accessToken: decrypt(tenant.fiskaltrustAccessToken_encrypted!),
      environment: tenant.fiskaltrustEnvironment === 'production' ? 'production' : 'sandbox',
    });
    signFn = (d) => client.signReceipt(d);
    certSerial = tenant.fiskaltrustCashboxId!;
  }

  const previousHash = await getPreviousReceiptHash(tenantId, receiptId);
  const previousSignature = await getPreviousSignature(tenantId, receiptId);
  const sigVorigerBeleg = buildSigVorigerBeleg(previousSignature);

  const signData = [
    receipt.receiptNumber,
    receipt.createdAt.toISOString(),
    String(receipt.totalGross),
    previousHash,
  ].join('|');

  let signature: string;
  try {
    signature = await signFn(signData);
  } catch (err) {
    const label = err instanceof ATrustError ? 'A-Trust' : err instanceof FiskaltrustError ? 'fiskaltrust' : 'Signing';
    const cause = (err as { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error ? cause.message : (cause ? String(cause) : '');
    console.error(`[sign] ${label} fehlgeschlagen für ${receiptId}:`, (err as Error).message, causeMsg);
    await prisma.receipt.update({ where: { id: receiptId }, data: { status: 'offline_pending' } });
    return;
  }

  const receiptHash = calculateReceiptHash(
    receipt.receiptNumber,
    receipt.createdAt,
    receipt.totalGross,
    previousHash,
    signature,
  );

  const isStorno = receipt.type === 'cancellation';
  const isTraining = receipt.type === 'training';
  const isSpecialZero = ['null_receipt', 'start_receipt', 'month_receipt', 'year_receipt', 'closing_receipt'].includes(receipt.type);

  let umsatzzaehlerEncrypted: string;
  let cumulativeSum = 0;
  const aesKey = await getOrCreateAesKey(tenantId);

  if (isStorno) {
    umsatzzaehlerEncrypted = encryptSpecialMarker('STO', receipt.cashRegisterId, receipt.receiptNumber, aesKey);
  } else if (isTraining) {
    umsatzzaehlerEncrypted = encryptSpecialMarker('TRA', receipt.cashRegisterId, receipt.receiptNumber, aesKey);
  } else if (isSpecialZero) {
    umsatzzaehlerEncrypted = encryptUmsatzzaehler(0, receipt.cashRegisterId, receipt.receiptNumber, aesKey);
  } else {
    cumulativeSum = (await getCumulativeUmsatz(tenantId, receiptId)) + receipt.totalGross;
    umsatzzaehlerEncrypted = encryptUmsatzzaehler(cumulativeSum, receipt.cashRegisterId, receipt.receiptNumber, aesKey);
  }

  const rksv: RKSVData = {
    registrierkasseId: receipt.cashRegisterId,
    belegnummer: receipt.receiptNumber,
    barumsatzSumme: cumulativeSum,
    umsatzzaehlerEncrypted,
    previousReceiptHash: previousHash,
    receiptHash,
    signature,
    qrCodeData: '',
    signedAt: new Date(),
    atCertificateSerial: certSerial,
  };

  const fullReceipt: Receipt = {
    id: receipt.id,
    tenantId: receipt.tenantId,
    receiptNumber: receipt.receiptNumber,
    cashRegisterId: receipt.cashRegisterId,
    type: receipt.type as ReceiptType,
    status: 'signed' as ReceiptStatus,
    createdAt: receipt.createdAt,
    cashierId: receipt.cashierId,
    channel: receipt.channel as SalesChannel,
    externalOrderId: receipt.externalOrderId,
    items: [],
    payment: {
      method: receipt.paymentMethod as PaymentMethod,
      amountPaid: receipt.amountPaid,
      change: receipt.change,
      tip: receipt.tip,
    },
    rksv,
    totals: {
      subtotalNet: receipt.subtotalNet,
      vat0: receipt.vat0,
      vat10: receipt.vat10,
      vat13: receipt.vat13,
      vat20: receipt.vat20,
      totalVat: receipt.totalVat,
      totalGross: receipt.totalGross,
    },
  };

  const qrCodeData = buildQRCodeData(fullReceipt, rksv, umsatzzaehlerEncrypted, sigVorigerBeleg);
  rksv.qrCodeData = qrCodeData;

  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status: 'signed',
      rksv_registrierkasseId: receipt.cashRegisterId,
      rksv_belegnummer: receipt.receiptNumber,
      rksv_barumsatzSumme: cumulativeSum,
      rksv_umsatzzaehlerEncrypted: umsatzzaehlerEncrypted,
      rksv_previousReceiptHash: previousHash,
      rksv_receiptHash: receiptHash,
      rksv_signature: signature,
      rksv_qrCodeData: qrCodeData,
      rksv_signedAt: new Date(),
      rksv_atCertificateSerial: certSerial,
    },
  });

  await prisma.dEPEntry.upsert({
    where: { receiptId },
    create: {
      tenantId,
      receiptId,
      belegnummer: receipt.receiptNumber,
      belegtyp: receipt.type,
      timestamp: receipt.createdAt,
      rksv_hash: receiptHash,
      signature,
      rawData: {
        Registrierkassenidentifikationsnummer: receipt.cashRegisterId,
        Belegnummer: receipt.receiptNumber,
        Belegdatum: receipt.createdAt.toISOString(),
        Betrag: receipt.totalGross / 100,
        Umsatz_Normal: receipt.vat20 / 100,
        Umsatz_Ermaessigt_1: receipt.vat10 / 100,
        Umsatz_Ermaessigt_2: receipt.vat13 / 100,
        Umsatz_Besonders: 0,
        Umsatz_Null: receipt.vat0 / 100,
        Verschluesselter_Umsatzzaehler: umsatzzaehlerEncrypted,
        Zertifikatsseriennummer: certSerial,
        Sig_Voriger_Beleg: sigVorigerBeleg,
        Signaturwert: signature,
        QR_Code: qrCodeData,
      },
    },
    update: {
      rksv_hash: receiptHash,
      signature,
      rawData: {
        Registrierkassenidentifikationsnummer: receipt.cashRegisterId,
        Belegnummer: receipt.receiptNumber,
        Belegdatum: receipt.createdAt.toISOString(),
        Betrag: receipt.totalGross / 100,
        Umsatz_Normal: receipt.vat20 / 100,
        Umsatz_Ermaessigt_1: receipt.vat10 / 100,
        Umsatz_Ermaessigt_2: receipt.vat13 / 100,
        Umsatz_Besonders: 0,
        Umsatz_Null: receipt.vat0 / 100,
        Verschluesselter_Umsatzzaehler: umsatzzaehlerEncrypted,
        Zertifikatsseriennummer: certSerial,
        Sig_Voriger_Beleg: sigVorigerBeleg,
        Signaturwert: signature,
        QR_Code: qrCodeData,
      },
    },
  });

  console.log(`[sign] Bon ${receipt.receiptNumber} signiert (${receipt.type}, ${hasAtrust ? 'A-Trust' : 'fiskaltrust'})`);
}
