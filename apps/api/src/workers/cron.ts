/**
 * RKSV Cron Jobs
 *
 * Geplante Aufgaben:
 * - Monatsbeleg: 1. jeden Monats um 00:01 Uhr (Europe/Vienna)
 * - Jahresbeleg: 1. Januar um 00:01 Uhr (Europe/Vienna), ersetzt Monatsbeleg
 * - Retry offline_pending: alle 15 Minuten
 *
 * Nutzt node-cron für Cron-Scheduling.
 * Die eigentlichen Jobs werden über BullMQ rksvQueue eingereiht.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { rksvQueue } from '../lib/queue';
import { WixProductsService } from '../modules/wix/wix-products.service';

// ============================================================
// Hilfsfunktion: Alle aktiven Tenants mit RKSV ermitteln
// ============================================================

async function getActiveRksvTenants(): Promise<string[]> {
  const tenants = await prisma.tenant.findMany({
    where: {
      rksvEnabled: true,
      status: { in: ['active', 'trial'] },
    },
    select: { id: true },
  });
  return tenants.map(t => t.id);
}

// ============================================================
// Monatsbeleg: 1. jeden Monats um 00:01 Uhr
// ============================================================

async function triggerMonthReceipts(): Promise<void> {
  const month = new Date();
  // Erster Tag des aktuellen Monats um 00:01
  month.setDate(1);
  month.setHours(0, 1, 0, 0);

  const tenantIds = await getActiveRksvTenants();
  console.log(
    `[RKSV Cron] Monatsbeleg für ${tenantIds.length} Tenants — ${month.toISOString()}`,
  );

  for (const tenantId of tenantIds) {
    await rksvQueue.add('create_month_receipt', {
      tenantId,
      month: month.toISOString(),
    });
  }
}

// ============================================================
// Jahresbeleg: 1. Januar um 00:01 Uhr
// ============================================================

async function triggerYearReceipts(): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();

  const tenantIds = await getActiveRksvTenants();
  console.log(
    `[RKSV Cron] Jahresbeleg ${year} für ${tenantIds.length} Tenants`,
  );

  for (const tenantId of tenantIds) {
    // Jahr-Beleg statt Monats-Beleg: create_year_receipt
    await rksvQueue.add('create_year_receipt', {
      tenantId,
      month: new Date(year, 0, 1, 0, 1, 0).toISOString(),
    });
  }
}

// ============================================================
// Retry offline_pending Signaturen: alle 15 Minuten
// ============================================================

async function triggerRetrySignatures(): Promise<void> {
  const pendingCount = await prisma.receipt.count({
    where: { status: 'offline_pending' },
  });

  if (pendingCount === 0) return;

  console.log(`[RKSV Cron] Retry: ${pendingCount} offline_pending Bons`);

  // retry_signatures Job ohne Tenant-Filter — der Worker verarbeitet alle
  await rksvQueue.add('retry_signatures', { tenantId: '', date: '' });
}

// ============================================================
// DEP Backup: täglich um 03:00 Uhr für den Vortag
// ============================================================

async function triggerDailyDepBackup(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().substring(0, 10); // "YYYY-MM-DD"

  const tenantIds = await getActiveRksvTenants();
  console.log(
    `[RKSV Cron] DEP Backup für ${date} — ${tenantIds.length} Tenants`,
  );

  for (const tenantId of tenantIds) {
    await rksvQueue.add('dep_backup', { tenantId, date });
  }
}

// ============================================================
// Wix Produkt-Sync: stündlich
// ============================================================

const wixProductsService = new WixProductsService();

async function triggerWixProductSync(): Promise<void> {
  // Load all tenants that have Wix configured and active
  const tenants = await prisma.tenant.findMany({
    where: {
      wixIsActive: true,
      wixApiKey_encrypted: { not: null },
      status: { in: ['active', 'trial'] },
    },
    select: { id: true },
  });

  if (tenants.length === 0) return;

  console.log(`[Wix Cron] Produkt-Sync für ${tenants.length} Tenant(s)`);

  for (const tenant of tenants) {
    try {
      const result = await wixProductsService.syncProducts(tenant.id);
      console.log(
        `[Wix Cron] Tenant ${tenant.id}: +${result.created} neu, ${result.updated} aktualisiert, ${result.deleted} gelöscht`,
      );
    } catch (err: unknown) {
      console.error(`[Wix Cron] Sync fehlgeschlagen für Tenant ${tenant.id}:`, err);
    }
  }
}

// ============================================================
// Cron Registrierung
// ============================================================

/**
 * Registriert alle RKSV-Cron-Jobs.
 *
 * Cron-Ausdrücke in Europe/Vienna Lokalzeit:
 * - Monatsbeleg: "1 0 1 * *"  — 1. jeden Monats, 00:01 Uhr
 * - Jahresbeleg: "1 0 1 1 *"  — 1. Januar, 00:01 Uhr
 * - Retry:       "* /15 * * * *" — alle 15 Minuten
 * - DEP Backup:  "0 3 * * *"  — täglich 03:00 Uhr
 *
 * node-cron nutzt die lokale Systemzeit; der API-Server sollte daher
 * in der Timezone Europe/Vienna laufen (TZ=Europe/Vienna).
 */
export function registerRksvCronJobs(): void {
  // Monatsbeleg am 1. jedes Monats um 00:01 Uhr
  // Ausnahme Januar: dann Jahresbeleg (beide laufen, Jahresbeleg überschreibt)
  cron.schedule(
    '1 0 1 * *',
    () => {
      const now = new Date();
      const isJanuary = now.getMonth() === 0;

      if (isJanuary) {
        // Januar: Jahresbeleg statt Monatsbeleg
        void triggerYearReceipts().catch(err => {
          console.error('[RKSV Cron] Jahresbeleg Fehler:', err);
        });
      } else {
        void triggerMonthReceipts().catch(err => {
          console.error('[RKSV Cron] Monatsbeleg Fehler:', err);
        });
      }
    },
    {
      timezone: 'Europe/Vienna',
    },
  );

  // Retry offline_pending alle 15 Minuten
  cron.schedule(
    '*/15 * * * *',
    () => {
      void triggerRetrySignatures().catch(err => {
        console.error('[RKSV Cron] Retry Signaturen Fehler:', err);
      });
    },
    {
      timezone: 'Europe/Vienna',
    },
  );

  // DEP Backup täglich um 03:00 Uhr
  cron.schedule(
    '0 3 * * *',
    () => {
      void triggerDailyDepBackup().catch(err => {
        console.error('[RKSV Cron] DEP Backup Fehler:', err);
      });
    },
    {
      timezone: 'Europe/Vienna',
    },
  );

  // Wix Produkt-Sync: stündlich zur vollen Stunde
  cron.schedule(
    '0 * * * *',
    () => {
      void triggerWixProductSync().catch(err => {
        console.error('[Wix Cron] Produkt-Sync Fehler:', err);
      });
    },
    {
      timezone: 'Europe/Vienna',
    },
  );

  console.log('[RKSV Cron] Jobs registriert:');
  console.log('  - Monatsbeleg: 1. jeden Monats um 00:01 Uhr (Europe/Vienna)');
  console.log('  - Jahresbeleg: 1. Januar um 00:01 Uhr (Europe/Vienna)');
  console.log('  - Retry offline_pending: alle 15 Minuten');
  console.log('  - DEP Backup: täglich um 03:00 Uhr (Europe/Vienna)');
  console.log('  - Wix Produkt-Sync: stündlich zur vollen Stunde (Europe/Vienna)');
}
