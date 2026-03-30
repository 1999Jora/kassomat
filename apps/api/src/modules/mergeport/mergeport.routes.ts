import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/crypto';
import { AppError, NotFoundError } from '../../lib/errors';
import { requireRole } from '../../middleware/auth';
import { MergeportClient } from './mergeport.client';
import { mapMergeportOrder, mapKassomatStatusToMergeport } from './mergeport.mapper';
import type { MergeportOrderStatus } from './mergeport.client';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const updateStateSchema = z.object({
  state: z.enum([
    'fetchedByPOS',
    'acceptedByPOS',
    'preparing',
    'ready',
    'pickedUp',
    'inDelivery',
    'delivered',
    'canceledByPOS',
    'rejectedByPOS',
  ] as const),
  timeChange: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Helper: Client für Tenant erstellen
// ---------------------------------------------------------------------------

async function getMergeportClient(tenantId: string): Promise<MergeportClient> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      mergeportEnabled: true,
      mergeportApiKey_encrypted: true,
      mergeportSiteId: true,
    },
  });

  if (!tenant) throw new NotFoundError('Tenant');

  if (!tenant.mergeportEnabled) {
    throw new AppError(
      403,
      'INTEGRATION_DISABLED',
      'Mergeport-Integration ist für diesen Tenant nicht aktiviert',
    );
  }

  if (!tenant.mergeportApiKey_encrypted) {
    throw new AppError(
      500,
      'CONFIGURATION_ERROR',
      'Mergeport API-Key ist nicht konfiguriert',
    );
  }

  const apiKey = decrypt(tenant.mergeportApiKey_encrypted);
  return new MergeportClient(apiKey);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function mergeportRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /mergeport/status
   * Prüft ob Mergeport konfiguriert und aktiv ist
   */
  fastify.get(
    '/mergeport/status',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: request.tenantId },
        select: {
          mergeportEnabled: true,
          mergeportApiKey_encrypted: true,
          mergeportSiteId: true,
        },
      });

      if (!tenant) throw new NotFoundError('Tenant');

      return reply.send({
        success: true,
        data: {
          enabled: tenant.mergeportEnabled,
          configured: !!(tenant.mergeportApiKey_encrypted && tenant.mergeportSiteId),
          siteId: tenant.mergeportSiteId ?? null,
        },
      });
    },
  );

  /**
   * GET /mergeport/orders
   * Aktive Bestellungen von Mergeport abrufen und in Kassomat-Format transformieren
   */
  fastify.get(
    '/mergeport/orders',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const client = await getMergeportClient(request.tenantId);
      const mergeportOrders = await client.getActiveOrders();

      const orders = mergeportOrders.map(mapMergeportOrder);

      return reply.send({ success: true, data: orders });
    },
  );

  /**
   * GET /mergeport/orders/:id
   * Einzelne Bestellung von Mergeport abrufen
   */
  fastify.get(
    '/mergeport/orders/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const client = await getMergeportClient(request.tenantId);
      const mergeportOrder = await client.getOrder(id);
      const order = mapMergeportOrder(mergeportOrder);

      return reply.send({ success: true, data: order });
    },
  );

  /**
   * PATCH /mergeport/orders/:id/state
   * Bestellstatus auf Mergeport aktualisieren
   */
  fastify.patch(
    '/mergeport/orders/:id/state',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateStateSchema.parse(request.body);

      const client = await getMergeportClient(request.tenantId);

      await client.setOrderState(id, {
        state: body.state as MergeportOrderStatus,
        timeChange: body.timeChange ?? undefined,
      });

      // Bestellung neu laden um aktuellen Status zurückzugeben
      const updated = await client.getOrder(id);
      const mapped = mapMergeportOrder(updated);

      return reply.send({ success: true, data: mapped });
    },
  );

  /**
   * POST /mergeport/sync-menu
   * Kassomat Produkte und Kategorien an Mergeport synchronisieren
   * Nur owner/admin
   */
  fastify.post(
    '/mergeport/sync-menu',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const client = await getMergeportClient(request.tenantId);

      // Alle aktiven Kategorien laden
      const categories = await prisma.category.findMany({
        where: { tenantId: request.tenantId },
        orderBy: { sortOrder: 'asc' },
      });

      // Alle aktiven Produkte laden
      const products = await prisma.product.findMany({
        where: {
          tenantId: request.tenantId,
          isActive: true,
          deletedAt: null,
        },
        include: { category: true },
      });

      // Kategorien an Mergeport senden
      const mergeportCategories = categories.map((cat) => ({
        id: cat.id,
        name: { de: cat.name },
        enabled: true,
      }));

      await client.syncCategories(mergeportCategories);

      // Produkte an Mergeport senden
      const mergeportItems = products.map((product) => ({
        id: product.pluCode ?? product.id,
        name: { de: product.name },
        price: {
          amount: product.price,
          currency: 'EUR',
        },
        categoryIds: [product.categoryId],
        enabled: product.isActive,
        reference: product.pluCode ?? undefined,
        ean: product.barcode ?? undefined,
      }));

      await client.syncItems(mergeportItems);

      // Ein Standard-Menü erstellen/aktualisieren
      const mergeportMenus = [{
        id: `kassomat-${request.tenantId}`,
        name: { de: 'Kassomat Speisekarte' },
        menuType: ['pickup' as const, 'delivery' as const],
        enabled: true,
      }];

      await client.syncMenus(mergeportMenus);

      return reply.send({
        success: true,
        data: {
          categoriesSynced: mergeportCategories.length,
          itemsSynced: mergeportItems.length,
          menusSynced: mergeportMenus.length,
        },
      });
    },
  );
}
