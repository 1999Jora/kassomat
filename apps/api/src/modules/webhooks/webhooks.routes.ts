import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LieferandoService } from '../lieferando/lieferando.service';
import { WixService } from '../wix/wix.service';
import { RealtimeService } from '../realtime/realtime.service';
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
              realtime.emitNewOrder(tenantId, order);
            }

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

            // Log what Wix actually sent for debugging
            request.log.info({ body, keys: Object.keys(body ?? {}) }, '[Wix] Received payload');

            let normalised: unknown = body;

            if (!body?.['data'] && (body?.['_id'] || body?.['lineItems'])) {
              // Wix Automations "Gesamte Nutzlast" format
              const items = (body['lineItems'] as Array<Record<string, unknown>> | undefined) ?? [];
              normalised = {
                data: {
                  orderId: body['_id'] ?? body['id'],
                  lineItems: items.map((i) => ({
                    id: i['_id'] ?? i['id'],
                    name: i['name'],
                    quantity: i['quantity'],
                    price: String(
                      (i['price'] as Record<string, unknown>)?.['amount'] ??
                      (i['price'] as Record<string, unknown>)?.['formattedAmount'] ??
                      i['price'] ??
                      '0',
                    ).replace(',', '.'),
                  })),
                  buyerInfo: body['buyerInfo'] ?? {},
                  shippingInfo: body['shippingInfo'],
                  paymentStatus: body['paymentStatus'] ?? 'PAID',
                  note: body['buyerNote'] ?? body['note'],
                },
              };
            }

            const order = await wixService.receiveOrder(tenantId, normalised, signature);

            const realtime = getRealtimeService(fastify);
            if (realtime) {
              realtime.emitNewOrder(tenantId, order);
            }
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
