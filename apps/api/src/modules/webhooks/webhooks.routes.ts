import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LieferandoService } from '../lieferando/lieferando.service';
import { WixService } from '../wix/wix.service';
import { RealtimeService } from '../realtime/realtime.service';
import { notificationService } from '../notifications/notification.service';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

// ---------------------------------------------------------------------------
// Services (singleton-per-route-registration)
// ---------------------------------------------------------------------------

const lieferandoService = new LieferandoService();
const wixService = new WixService();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIncomingOrder(p: any): any {
  return {
    ...p,
    customer: p.customerName ? {
      name: p.customerName,
      phone: p.customerPhone ?? null,
      email: p.customerEmail ?? null,
    } : null,
    deliveryAddress: p.deliveryStreet ? {
      street: p.deliveryStreet,
      city: p.deliveryCity ?? '',
      zip: p.deliveryZip ?? '',
      notes: p.deliveryNotes ?? null,
    } : null,
  };
}

/**
 * Extract the raw body string from a Fastify request.
 * Fastify stores the raw body buffer on request.rawBody when the
 * addContentTypeParser / preParsing hook preserves it; otherwise we
 * fall back to re-serialising the parsed body.
 */
function getRawBody(request: FastifyRequest): string {
  // rawBody is added by our custom content-type parser (see below)
  const raw = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
  if (raw) return raw.toString('utf8');
  // Fallback — works for JSON payloads that have already been parsed
  return JSON.stringify(request.body);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function webhooksRoutes(fastify: FastifyInstance): Promise<void> {
  // ---- Preserve raw body for signature verification ----
  // We add a content-type parser that stores the raw bytes before Fastify
  // parses JSON. This is necessary to verify HMAC signatures against the
  // exact bytes sent by the webhook provider.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (
      _req: FastifyRequest,
      body: Buffer,
      done: (err: Error | null, body?: unknown) => void,
    ) => {
      try {
        // Attach raw buffer to request for later signature check
        (_req as FastifyRequest & { rawBody?: Buffer }).rawBody = body;
        const parsed: unknown = JSON.parse(body.toString('utf8'));
        done(null, parsed);
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /webhooks/lieferando
  // -------------------------------------------------------------------------
  // No JWT auth — signature verification is the security mechanism.
  // Lieferando requires a response within 2 seconds, so we:
  //   1. Send 200 immediately
  //   2. Process the order asynchronously
  // -------------------------------------------------------------------------
  fastify.post(
    '/webhooks/lieferando',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = (request.headers['x-jet-signature'] as string | undefined) ?? '';
      const tenantId = (request.headers['x-tenant-id'] as string | undefined) ?? '';

      if (!tenantId) {
        return reply.code(400).send({ success: false, error: 'Missing X-Tenant-Id header' });
      }

      // Respond 200 immediately to meet the 2-second SLA
      void reply.code(200).send({ success: true });

      // Process asynchronously — errors are logged, not returned to caller
      setImmediate(() => {
        void (async () => {
          try {
            const rawBody = getRawBody(request);

            const order = await lieferandoService.receiveOrder(
              tenantId,
              request.body,
              // Pass the raw string for signature verification
              signature,
            );

            // Emit WebSocket event to tenant room
            const realtime = getRealtimeService(fastify);
            if (realtime) {
              realtime.emitNewOrder(tenantId, toIncomingOrder(order));
            }

            // Send push notification for background app
            void notificationService.sendOrderNotification(tenantId, {
              id: (order as { id: string }).id,
              externalId: (order as { externalId: string }).externalId,
              source: 'lieferando',
            }).catch((err: unknown) => {
              request.log.error({ err }, '[Lieferando] Push notification failed');
            });

            // Auto-assign delivery to driver with fewest active stops
            await autoAssignDelivery(tenantId, (order as { id: string }).id).catch((err: unknown) => {
              request.log.error({ err }, '[Lieferando] Auto-assign delivery failed');
            });

            // Auto-accept if tenant has autoAccept enabled
            const tenant = await prisma.tenant.findUnique({
              where: { id: tenantId },
              select: { lieferandoIsActive: true },
            });

            // Currently, the schema does not have an explicit autoAccept flag.
            // We check lieferandoIsActive as a proxy — can be extended when the
            // field is added to the schema.
            if (tenant?.lieferandoIsActive) {
              await lieferandoService
                .acceptOrder(tenantId, (order as { externalId: string }).externalId)
                .catch((err: unknown) => {
                  request.log.error({ err }, '[Lieferando] Auto-accept failed');
                });
            }
          } catch (err: unknown) {
            request.log.error({ err }, '[Lieferando] Webhook processing failed');
          }
        })();
      });

      return reply;
    },
  );

  // GET /webhooks/wix — URL-Validierung für Wix Automations
  fastify.get('/webhooks/wix', async (_request, reply) => {
    return reply.send({ success: true, service: 'kassomat-wix-webhook' });
  });

  // -------------------------------------------------------------------------
  // POST /webhooks/wix
  // -------------------------------------------------------------------------
  // No JWT auth — signature verification is the security mechanism.
  // Wix also expects a fast acknowledgement.
  // -------------------------------------------------------------------------
  fastify.post(
    '/webhooks/wix',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = (request.headers['x-wix-signature'] as string | undefined) ?? '';
      const tenantId =
        (request.headers['x-tenant-id'] as string | undefined) ??
        ((request.query as Record<string, string>)['tenantId'] ?? '');

      if (!tenantId) {
        return reply.code(400).send({ success: false, error: 'Missing tenantId' });
      }

      // Respond 200 immediately
      void reply.code(200).send({ success: true });

      // Process asynchronously
      setImmediate(() => {
        void (async () => {
          try {
            // Wix Automations sends the order directly (no wrapper), while native
            // Wix webhooks wrap it in { data: { orderId, lineItems, ... } }.
            // Normalise both formats into the native format before passing to service.
            const body = request.body as Record<string, unknown>;
            const order = await wixService.receiveOrder(tenantId, body, signature);

            const realtime = getRealtimeService(fastify);
            if (realtime) {
              realtime.emitNewOrder(tenantId, toIncomingOrder(order));
            }

            // Send push notification for background app
            void notificationService.sendOrderNotification(tenantId, {
              id: (order as { id: string }).id,
              externalId: (order as { externalId: string }).externalId,
              source: 'wix',
            }).catch((err: unknown) => {
              request.log.error({ err }, '[Wix] Push notification failed');
            });

            // Auto-assign delivery to driver with fewest active stops
            await autoAssignDelivery(tenantId, (order as { id: string }).id).catch((err: unknown) => {
              request.log.error({ err }, '[Wix] Auto-assign delivery failed');
            });
          } catch (err: unknown) {
            request.log.error({ err }, '[Wix] Webhook processing failed');
          }
        })();
      });

      return reply;
    },
  );
}

// ---------------------------------------------------------------------------
// Helper — safely retrieve the RealtimeService from the Fastify instance.
// The `fastify.realtime` decoration is registered by the socketio plugin.
// We access it defensively here to avoid a crash if the plugin is not loaded.
// ---------------------------------------------------------------------------

function getRealtimeService(
  fastify: FastifyInstance,
): RealtimeService | undefined {
  return (fastify as FastifyInstance & { realtime?: RealtimeService }).realtime;
}

// ---------------------------------------------------------------------------
// Auto-assign delivery to driver with fewest active stops
// ---------------------------------------------------------------------------

async function autoAssignDelivery(tenantId: string, orderId: string): Promise<void> {
  // Get active drivers
  const drivers = await (prisma as any).driver.findMany({
    where: { tenantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  }) as Array<{ id: string; sortOrder: number }>;
  if (drivers.length === 0) {
    // No drivers — create unassigned delivery
    await (prisma as any).delivery.create({ data: { tenantId, orderId } });
    return;
  }
  // Count active stops per driver
  const counts = await Promise.all(
    drivers.map(async (driver) => ({
      driver,
      count: await (prisma as any).delivery.count({
        where: { driverId: driver.id, status: { in: ['pending', 'picked_up', 'en_route'] } },
      }) as number,
    }))
  );
  // Assign to driver with fewest stops
  const best = counts.sort((a: { count: number }, b: { count: number }) => a.count - b.count)[0]!;
  await (prisma as any).delivery.create({
    data: {
      tenantId,
      orderId,
      driverId: best.driver.id,
      assignedAt: new Date(),
    },
  });
}
