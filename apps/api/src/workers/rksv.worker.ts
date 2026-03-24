/**
 * RKSV BullMQ Worker
 *
 * Verarbeitet asynchrone RKSV-Jobs:
 * - sign_receipt: Bon signieren via A-Trust HSM, Hash-Kette berechnen
 * - dep_backup: DEP-Export für alle Bons eines Tenants für ein Datum
 * - retry_signatures: offline_pending Bons erneut signieren
 * - create_month_receipt: Monatsbeleg erstellen
 * - create_year_receipt: Jahresbeleg erstellen
 *
 * Bei A-Trust Ausfall: status = 'offline_pending', BullMQ Retry geplant
 */

import { Worker, type Job } from 'bullmq';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import {
  ATrustClient,
  ATrustError,
  calculateReceiptHash,
  calculateInitialHash,
  buildQRCodeData,
  DEPBuilder,
} from '@kassomat/rksv';
import type {
  ReceiptType,
  ReceiptStatus,
  SalesChannel,
  VatRate,
  PaymentMethod,
  Receipt,
  RKSVData,
} from '@kassomat/types';
import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/crypto';
import {
  RKSV_QUEUE_NAME,
  rksvQueue,
  type SignReceiptJobData,
  type DepBackupJobData,
  type CreateMonthReceiptJobData,
} from '../lib/queue';

// ============================================================
// Redis Connection
// ============================================================

function getRedisConnection() {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parseInt(parsed.pathname?.slice(1) || '0', 10),
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    };
  }
}

// ============================================================
// Hilfsfunktion: Letzter signierter Hash
// ============================================================

/** Holt den Hash des letzten signierten Bons für diesen Tenant */
async function getPreviousReceiptHash(
  tenantId: string,
  currentReceiptId: string,
): Promise<string> {
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

// ============================================================
// Job: sign_receipt
// ============================================================

async function handleSignReceipt(job: Job<SignReceiptJobData>): Promise<void> {
  const { receiptId, tenantId } = job.data;

  // 1. Bon aus DB laden
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, tenantId },
  });

  if (!receipt) {
    throw new Error(`Receipt ${receiptId} nicht gefunden für Tenant ${tenantId}`);
  }

  // Bereits signiert? Nichts tun.
  if (receipt.status === 'signed' || receipt.status === 'printed') {
    return;
  }

  // 2. Tenant-Konfiguration laden
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      atrustCertificateSerial: true,
      atrustApiKey_encrypted: true,
      atrustEnvironment: true,
      rksvEnabled: true,
    },
  });

  if (!tenant) throw new Error(`Tenant ${tenantId} nicht gefunden`);

  // RKSV deaktiviert oder A-Trust nicht konfiguriert
  if (!tenant.rksvEnabled || !tenant.atrustCertificateSerial || !tenant.atrustApiKey_encrypted) {
    await prisma.receipt.update({
      where: { id: receiptId },
      data: { status: 'signed', rksv_signedAt: new Date() },
    });
    return;
  }

  const apiKey = decrypt(tenant.atrustApiKey_encrypted);
  const atrustClient = new ATrustClient({
    certificateSerial: tenant.atrustCertificateSerial,
    apiKey,
    environment: tenant.atrustEnvironment === 'production' ? 'production' : 'test',
  });

  // 3. Vorherigen Hash ermitteln
  const previousHash = await getPreviousReceiptHash(tenantId, receiptId);

  // 4. Daten-String zum Signieren aufbauen
  const signData = [
    receipt.receiptNumber,
    receipt.createdAt.toISOString(),
    String(receipt.totalGross),
    previousHash,
  ].join('|');

  // 5. A-Trust Signatur holen (mit Retry-Logik in ATrustClient)
  let signature: string;
  try {
    signature = await atrustClient.signReceipt(signData);
  } catch (err) {
    if (err instanceof ATrustError) {
      console.error(`[RKSV Worker] A-Trust Signatur fehlgeschlagen für ${receiptId}:`, err.message);
    } else {
      console.error(`[RKSV Worker] Unbekannter Fehler bei Signatur für ${receiptId}:`, err);
    }
    // offline_pending setzen, BullMQ plant Retry
    await prisma.receipt.update({
      where: { id: receiptId },
      data: { status: 'offline_pending' },
    });
    throw err;
  }

  // 6. Receipt-Hash berechnen (Hash-Kette)
  const receiptHash = calculateReceiptHash(
    receipt.receiptNumber,
    receipt.createdAt,
    receipt.totalGross,
    previousHash,
    signature,
  );

  // 7. RKSV-Daten und QR-Code aufbauen
  const rksv: RKSVData = {
    registrierkasseId: receipt.cashRegisterId,
    belegnummer: receipt.receiptNumber,
    barumsatzSumme: receipt.totalGross,
    previousReceiptHash: previousHash,
    receiptHash,
    signature,
    qrCodeData: '',
    signedAt: new Date(),
    atCertificateSerial: tenant.atrustCertificateSerial,
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
      vat20: receipt.vat20,
      totalVat: receipt.totalVat,
      totalGross: receipt.totalGross,
    },
  };

  const qrCodeData = buildQRCodeData(fullReceipt, rksv);
  rksv.qrCodeData = qrCodeData;

  // 8. DB aktualisieren: RKSV-Felder setzen, status = 'signed'
  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status: 'signed',
      rksv_registrierkasseId: receipt.cashRegisterId,
      rksv_belegnummer: receipt.receiptNumber,
      rksv_barumsatzSumme: receipt.totalGross,
      rksv_previousReceiptHash: previousHash,
      rksv_receiptHash: receiptHash,
      rksv_signature: signature,
      rksv_qrCodeData: qrCodeData,
      rksv_signedAt: new Date(),
      rksv_atCertificateSerial: tenant.atrustCertificateSerial,
    },
  });

  // 9. DEP-Eintrag erstellen
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
        Signaturwert: signature,
        Sig_Voriger_Beleg: previousHash,
        QR_Code: qrCodeData,
        Zertifikatsseriennummer: tenant.atrustCertificateSerial,
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
        Signaturwert: signature,
        Sig_Voriger_Beleg: previousHash,
        QR_Code: qrCodeData,
        Zertifikatsseriennummer: tenant.atrustCertificateSerial,
      },
    },
  });

  console.log(`[RKSV Worker] Bon ${receipt.receiptNumber} signiert`);
}

// ============================================================
// Job: dep_backup
// ============================================================

async function handleDepBackup(job: Job<DepBackupJobData>): Promise<void> {
  const { tenantId, date } = job.data;

  // Alle signierten Bons des Tenants für das Datum laden
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const receipts = await prisma.receipt.findMany({
    where: {
      tenantId,
      status: { in: ['signed', 'printed'] },
      createdAt: { gte: startOfDay, lte: endOfDay },
      rksv_receiptHash: { not: null },
    },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  });

  if (receipts.length === 0) {
    console.log(`[RKSV Worker] DEP Backup ${tenantId}/${date}: Keine signierten Bons`);
    return;
  }

  const builder = new DEPBuilder();

  for (const receipt of receipts) {
    if (
      !receipt.rksv_receiptHash ||
      !receipt.rksv_signature ||
      !receipt.rksv_atCertificateSerial
    ) {
      continue;
    }

    const rksvData: RKSVData = {
      registrierkasseId: receipt.rksv_registrierkasseId ?? receipt.cashRegisterId,
      belegnummer: receipt.rksv_belegnummer ?? receipt.receiptNumber,
      barumsatzSumme: receipt.rksv_barumsatzSumme,
      previousReceiptHash: receipt.rksv_previousReceiptHash ?? '',
      receiptHash: receipt.rksv_receiptHash,
      signature: receipt.rksv_signature,
      qrCodeData: receipt.rksv_qrCodeData ?? '',
      signedAt: receipt.rksv_signedAt,
      atCertificateSerial: receipt.rksv_atCertificateSerial,
    };

    const receiptForDep: Receipt = {
      id: receipt.id,
      tenantId: receipt.tenantId,
      receiptNumber: receipt.receiptNumber,
      cashRegisterId: receipt.cashRegisterId,
      type: receipt.type as ReceiptType,
      status: receipt.status as ReceiptStatus,
      createdAt: receipt.createdAt,
      cashierId: receipt.cashierId,
      channel: receipt.channel as SalesChannel,
      externalOrderId: receipt.externalOrderId,
      items: receipt.items.map(item => ({
        id: item.id,
        receiptId: item.receiptId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate as VatRate,
        discount: item.discount,
        totalNet: item.totalNet,
        totalVat: item.totalVat,
        totalGross: item.totalGross,
      })),
      payment: {
        method: receipt.paymentMethod as PaymentMethod,
        amountPaid: receipt.amountPaid,
        change: receipt.change,
        tip: receipt.tip,
      },
      rksv: rksvData,
      totals: {
        subtotalNet: receipt.subtotalNet,
        vat0: receipt.vat0,
        vat10: receipt.vat10,
        vat20: receipt.vat20,
        totalVat: receipt.totalVat,
        totalGross: receipt.totalGross,
      },
    };

    builder.addReceipt(receiptForDep, rksvData);
  }

  // DEP-Export in Datei schreiben
  const depDir = process.env['DEP_EXPORT_DIR'] ?? '/tmp/dep-exports';
  await mkdir(depDir, { recursive: true });

  const filename = `dep-${tenantId}-${date}.json`;
  const filepath = join(depDir, filename);
  await builder.exportToFile(filepath);

  // DailyClosing mit DEP-Pfad aktualisieren (falls vorhanden)
  await prisma.dailyClosing.updateMany({
    where: { tenantId, date },
    data: { depExportPath: filepath },
  });

  console.log(
    `[RKSV Worker] DEP Backup erstellt: ${filepath} (${receipts.length} Bons)`,
  );
}

// ============================================================
// Job: retry_signatures
// ============================================================

async function handleRetrySignatures(): Promise<void> {
  const offlineReceipts = await prisma.receipt.findMany({
    where: { status: 'offline_pending' },
    select: { id: true, tenantId: true },
    take: 50,
  });

  if (offlineReceipts.length === 0) return;

  console.log(`[RKSV Worker] Retry: ${offlineReceipts.length} offline_pending Bons`);

  for (const receipt of offlineReceipts) {
    await rksvQueue.add(
      'sign_receipt',
      { receiptId: receipt.id, tenantId: receipt.tenantId },
      { delay: 0 },
    );
  }
}

// ============================================================
// Job: create_month_receipt / create_year_receipt
// ============================================================

async function handleCreateSpecialReceipt(
  job: Job<CreateMonthReceiptJobData>,
): Promise<void> {
  const { tenantId, month } = job.data;
  const isYearReceipt = job.name === 'create_year_receipt';

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, rksvEnabled: true },
  });

  if (!tenant?.rksvEnabled) {
    console.log(`[RKSV Worker] Sonderbeleg übersprungen — RKSV deaktiviert für ${tenantId}`);
    return;
  }

  // Fortlaufende Belegnummer ermitteln
  const now = new Date(month);
  const year = now.getFullYear();

  const last = await prisma.receipt.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: { receiptNumber: true },
  });

  let nextNum = 1;
  if (last?.receiptNumber) {
    const parts = last.receiptNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1] ?? '0', 10);
    nextNum = lastNum + 1;
  }

  const receiptNumber = `${year}-${String(nextNum).padStart(6, '0')}`;
  const type = isYearReceipt ? 'year_receipt' : 'month_receipt';

  // Owner als Kassierer für automatische Bons
  const owner = await prisma.user.findFirst({
    where: { tenantId, role: 'owner' },
    select: { id: true },
  });

  if (!owner) {
    throw new Error(`Kein Owner für Tenant ${tenantId} gefunden`);
  }

  const sonderbeleg = await prisma.receipt.create({
    data: {
      tenantId,
      receiptNumber,
      cashRegisterId: 'KASSE-01',
      type,
      status: 'pending',
      cashierId: owner.id,
      channel: 'direct',
      paymentMethod: 'cash',
      amountPaid: 0,
      change: 0,
      tip: 0,
      subtotalNet: 0,
      vat0: 0,
      vat10: 0,
      vat20: 0,
      totalVat: 0,
      totalGross: 0,
    },
  });

  await rksvQueue.add('sign_receipt', {
    receiptId: sonderbeleg.id,
    tenantId,
  });

  console.log(
    `[RKSV Worker] ${type} erstellt: ${receiptNumber} für Tenant ${tenantId}`,
  );
}

// ============================================================
// Worker Factory
// ============================================================

/** BullMQ Worker starten */
export function startRKSVWorker(): Worker {
  const worker = new Worker(
    RKSV_QUEUE_NAME,
    async (job) => {
      const { name } = job;

      if (name === 'sign_receipt') {
        await handleSignReceipt(job as Job<SignReceiptJobData>);
        return;
      }

      if (name === 'retry_signatures') {
        await handleRetrySignatures();
        return;
      }

      if (name === 'dep_backup') {
        await handleDepBackup(job as Job<DepBackupJobData>);
        return;
      }

      if (name === 'create_month_receipt' || name === 'create_year_receipt') {
        await handleCreateSpecialReceipt(job as Job<CreateMonthReceiptJobData>);
        return;
      }

      throw new Error(`Unbekannter Job-Typ: ${name}`);
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
      lockDuration: 60_000,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[RKSV Worker] Job ${job?.name} (${job?.id}) fehlgeschlagen:`, err);
  });

  worker.on('completed', (job) => {
    console.log(`[RKSV Worker] Job ${job.name} (${job.id}) abgeschlossen`);
  });

  worker.on('error', (error) => {
    console.error('[RKSV Worker] Worker Fehler:', error);
  });

  return worker;
}
