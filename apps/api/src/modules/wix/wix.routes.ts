import type { FastifyInstance } from 'fastify';
import { WixProductsService } from './wix-products.service';
import { requireRole } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function wixRoutes(fastify: FastifyInstance): Promise<void> {
  const wixProductsService = new WixProductsService();

  /**
   * POST /wix/sync-products
   *
   * Manually trigger a product catalog sync from Wix for the authenticated
   * tenant. Requires owner or admin role.
   */
  fastify.post(
    '/wix/sync-products',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const result = await wixProductsService.syncProducts(request.tenantId);
      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /wix/sync-status
   *
   * Returns the last time a Wix product sync ran for the authenticated tenant,
   * derived from the most-recently updated product with a wixProductId.
   * Also returns whether the Wix integration is configured and active.
   */
  fastify.get(
    '/wix/sync-status',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: request.tenantId },
        select: {
          wixSiteId: true,
          wixIsActive: true,
        },
      });

      const configured = !!(tenant?.wixSiteId);
      const isActive = tenant?.wixIsActive ?? false;

      // Find the most recently synced wix product to infer last sync time
      const lastSyncedProduct = await prisma.product.findFirst({
        where: {
          tenantId: request.tenantId,
          wixProductId: { not: null },
        },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      });

      return reply.send({
        success: true,
        data: {
          configured,
          isActive,
          lastSyncAt: lastSyncedProduct?.updatedAt ?? null,
        },
      });
    },
  );
}
