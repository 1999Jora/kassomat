import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/crypto';
import { MergeportClient } from './mergeport.client';
import { mapMergeportOrder } from './mergeport.mapper';
import { notificationService } from '../notifications/notification.service';
import type { MergeportOrder } from './mergeport.client';

// ---------------------------------------------------------------------------
// Mergeport Polling Service
//
// Railway kann keine persistenten WebSocket-Verbindungen zuverlässig halten,
// daher pollen wir die Mergeport REST API regelmäßig nach neuen Bestellungen.
//
// Für jeden Tenant mit aktivierter Mergeport-Integration:
// 1. GET /pos/orders/active alle 30 Sekunden
// 2. Neue Bestellungen erkennen (noch nicht in DB)
// 3. Auto-Mark als fetchedByPOS
// 4. In DB speichern + Socket.IO Event emittieren
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000; // 30 Sekunden
const STALE_CHECK_INTERVAL_MS = 5 * 60_000; // 5 Minuten: Tenant-Liste neu laden

/** Set von Mergeport Order-IDs die bereits verarbeitet wurden (pro Tenant) */
const processedOrders = new Map<string, Set<string>>();

/** Timer-Handle für cleanup */
let pollTimer: ReturnType<typeof setInterval> | null = null;
let tenantRefreshTimer: ReturnType<typeof setInterval> | null = null;

/** Cache der aktiven Tenants mit Mergeport-Config */
interface MergeportTenantConfig {
  tenantId: string;
  apiKey: string;
  siteId: string;
}

let activeTenants: MergeportTenantConfig[] = [];

// ---------------------------------------------------------------------------
// Tenant-Liste laden
// ---------------------------------------------------------------------------

async function refreshActiveTenants(): Promise<void> {
  try {
    const tenants = await prisma.tenant.findMany({
      where: {
        mergeportEnabled: true,
        mergeportApiKey_encrypted: { not: null },
        status: 'active',
      },
      select: {
        id: true,
        mergeportApiKey_encrypted: true,
        mergeportSiteId: true,
      },
    });

    // Auch Tenants im Trial-Status berücksichtigen
    const trialTenants = await prisma.tenant.findMany({
      where: {
        mergeportEnabled: true,
        mergeportApiKey_encrypted: { not: null },
        status: 'trial',
        trialEndsAt: { gt: new Date() },
      },
      select: {
        id: true,
        mergeportApiKey_encrypted: true,
        mergeportSiteId: true,
      },
    });

    activeTenants = [...tenants, ...trialTenants]
      .filter((t) => t.mergeportApiKey_encrypted && t.mergeportSiteId)
      .map((t) => ({
        tenantId: t.id,
        apiKey: decrypt(t.mergeportApiKey_encrypted!),
        siteId: t.mergeportSiteId!,
      }));
  } catch (err) {
    // Logging passiert über Fastify — hier nur Fehler vermeiden
    console.error('[Mergeport Poller] Fehler beim Laden der Tenants:', err);
  }
}

// ---------------------------------------------------------------------------
// Einzelnen Tenant pollen
// ---------------------------------------------------------------------------

async function pollTenant(
  config: MergeportTenantConfig,
  fastify: FastifyInstance,
): Promise<void> {
  const { tenantId, apiKey } = config;

  try {
    const client = new MergeportClient(apiKey);
    const orders = await client.getActiveOrders();

    // Bekannte Order-IDs für diesen Tenant
    let known = processedOrders.get(tenantId);
    if (!known) {
      // Beim ersten Poll: Bereits in DB vorhandene Mergeport-Orders laden
      const existing = await prisma.incomingOrder.findMany({
        where: { tenantId, source: 'mergeport' },
        select: { externalId: true },
      });
      known = new Set(existing.map((o) => o.externalId));
      processedOrders.set(tenantId, known);
    }

    for (const order of orders) {
      if (known.has(order.id)) continue;

      // Neue Bestellung gefunden!
      known.add(order.id);

      try {
        await processNewOrder(order, tenantId, client, fastify);
      } catch (err) {
        fastify.log.error(
          { err, orderId: order.id, tenantId },
          '[Mergeport Poller] Fehler bei Bestellverarbeitung',
        );
      }
    }
  } catch (err) {
    fastify.log.error(
      { err, tenantId },
      '[Mergeport Poller] Fehler beim Abrufen der Bestellungen',
    );
  }
}

// ---------------------------------------------------------------------------
// Neue Bestellung verarbeiten
// ---------------------------------------------------------------------------

async function processNewOrder(
  order: MergeportOrder,
  tenantId: string,
  client: MergeportClient,
  fastify: FastifyInstance,
): Promise<void> {
  const mapped = mapMergeportOrder(order);

  // Als fetchedByPOS markieren (wenn Mergeport das erlaubt)
  const canFetch = order.possibleStateChanges?.some(
    (s) => s.state === 'fetchedByPOS',
  );
  if (canFetch && order.status === 'receivedByProvider') {
    try {
      await client.setOrderState(order.id, { state: 'fetchedByPOS' });
    } catch (err) {
      fastify.log.warn(
        { err, orderId: order.id },
        '[Mergeport Poller] Konnte fetchedByPOS nicht setzen',
      );
    }
  }

  // In DB speichern (upsert für Idempotenz)
  const saved = await prisma.incomingOrder.upsert({
    where: {
      tenantId_externalId: {
        tenantId,
        externalId: order.id,
      },
    },
    create: {
      tenantId,
      source: 'mergeport',
      externalId: order.id,
      status: 'pending',
      customerName: mapped.customerName,
      customerPhone: mapped.customerPhone,
      deliveryStreet: mapped.deliveryStreet,
      deliveryCity: mapped.deliveryCity,
      deliveryZip: mapped.deliveryZip,
      paymentMethod: mapped.paymentMethod,
      totalAmount: mapped.totalAmount,
      notes: mapped.notes,
      rawPayload: order as never,
      items: {
        create: mapped.items.map((item) => ({
          externalId: item.externalId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          options: item.options,
        })),
      },
    },
    update: {
      rawPayload: order as never,
    },
    include: { items: true },
  });

  fastify.log.info(
    { orderId: order.id, tenantId, provider: mapped.providerName },
    '[Mergeport Poller] Neue Bestellung empfangen',
  );

  // Socket.IO Event an Frontend senden
  fastify.realtime.emitNewOrder(tenantId, {
    ...saved,
    // Mergeport-spezifische Zusatzinfos
    providerName: mapped.providerName,
    orderReference: mapped.orderReference,
    mergeportId: mapped.mergeportId,
    mergeportStatus: mapped.mergeportStatus,
    possibleStateChanges: mapped.possibleStateChanges,
    tip: mapped.tip,
    deliveryFee: mapped.deliveryFee,
  });

  // Send push notification for background app
  void notificationService.sendOrderNotification(tenantId, {
    id: saved.id,
    externalId: order.id,
    orderNumber: saved.orderNumber,
    source: 'mergeport',
    totalAmount: saved.totalAmount,
  }).catch((err) => {
    fastify.log.error({ err, orderId: order.id }, '[Mergeport Poller] Push notification failed');
  });
}

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------

export function startMergeportPoller(fastify: FastifyInstance): void {
  fastify.log.info('[Mergeport Poller] Starte Polling-Service...');

  // Initial Tenants laden
  void refreshActiveTenants().then(() => {
    fastify.log.info(
      `[Mergeport Poller] ${activeTenants.length} aktive Mergeport-Tenants gefunden`,
    );
  });

  // Polling-Loop
  pollTimer = setInterval(() => {
    for (const tenant of activeTenants) {
      void pollTenant(tenant, fastify);
    }
  }, POLL_INTERVAL_MS);

  // Tenant-Liste regelmäßig aktualisieren
  tenantRefreshTimer = setInterval(() => {
    void refreshActiveTenants();
  }, STALE_CHECK_INTERVAL_MS);
}

export function stopMergeportPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (tenantRefreshTimer) {
    clearInterval(tenantRefreshTimer);
    tenantRefreshTimer = null;
  }
  processedOrders.clear();
}
