import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { MyPOSService } from './mypos.service';
import type { MyPOSWebhookPayload } from './mypos.service';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const initiatePaymentSchema = z.object({
  amount: z.number().int().positive('Betrag muss positiv sein'),
  currency: z.string().default('EUR'),
  receiptId: z.string().min(1),
  orderId: z.string().min(1),
  terminalSerialNumber: z.string().optional(),
});

const transactionIdParamSchema = z.object({
  transactionId: z.string().min(1),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function myposRoutes(fastify: FastifyInstance): Promise<void> {
  const myposService = new MyPOSService(fastify);

  /**
   * POST /payments/card/initiate
   * Requires authentication.
   * Initiates a card payment on the myPOS terminal.
   */
  fastify.post(
    '/payments/card/initiate',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = initiatePaymentSchema.parse(request.body);

      const result = await myposService.initiatePayment(request.tenantId, {
        amount: body.amount,
        currency: body.currency,
        receiptId: body.receiptId,
        orderId: body.orderId,
        terminalSerialNumber: body.terminalSerialNumber,
      });

      return reply.code(201).send({ success: true, data: result });
    },
  );

  /**
   * GET /payments/card/:transactionId/status
   * Requires authentication.
   * Polls the current status of a card payment transaction.
   */
  fastify.get(
    '/payments/card/:transactionId/status',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { transactionId } = transactionIdParamSchema.parse(request.params);

      const result = await myposService.getPaymentStatus(request.tenantId, transactionId);

      return reply.send({ success: true, data: result });
    },
  );

  /**
   * POST /webhooks/mypos
   * NO authentication required — called directly by myPOS.
   * Processes IPN (Instant Payment Notification) callbacks.
   * Always responds 200 immediately so myPOS doesn't retry.
   */
  fastify.post('/webhooks/mypos', async (request, reply) => {
    // Respond 200 immediately as required by myPOS IPN spec
    reply.code(200).send({ received: true });

    // Process asynchronously after responding
    const payload = request.body as MyPOSWebhookPayload;

    myposService.processWebhook(payload).catch((err: unknown) => {
      fastify.log.error({ err, body: payload }, '[myPOS] Webhook processing error');
    });
  });
}
