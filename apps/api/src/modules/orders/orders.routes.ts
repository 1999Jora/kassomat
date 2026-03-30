import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { OrdersService } from './orders.service';

const listQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'in_progress', 'completed', 'cancelled']).optional(),
  source: z.enum(['lieferando', 'wix', 'mergeport']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const updateStatusSchema = z.object({
  status: z.enum(['accepted', 'in_progress', 'completed', 'cancelled']),
  reason: z.string().optional(),
});

const createReceiptSchema = z.object({
  payment: z.object({
    method: z.enum(['cash', 'card', 'online']),
    amountPaid: z.number().int().min(0),
    tip: z.number().int().min(0).default(0),
  }),
});

export async function ordersRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new OrdersService();

  /** GET /orders */
  fastify.get('/orders', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const result = await service.list(request.tenantId, query);
    return reply.send({ success: true, data: result });
  });

  /** PATCH /orders/:id/status */
  fastify.patch('/orders/:id/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateStatusSchema.parse(request.body);
    const order = await service.updateStatus(request.tenantId, id, body.status, body.reason);
    return reply.send({ success: true, data: order });
  });

  /** POST /orders/test-emit — emit a mock order:new event for testing */
  fastify.post(
    '/orders/test-emit',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const mockOrder = {
        id: 'test-' + Date.now(),
        tenantId: request.tenantId,
        source: 'wix' as const,
        externalId: 'TEST-' + Math.floor(Math.random() * 9000 + 1000),
        status: 'pending' as const,
        receivedAt: new Date(),
        items: [
          { externalId: 'p1', name: 'Cola 0,5l', quantity: 2, unitPrice: 299, totalPrice: 598, options: [] },
          { externalId: 'p2', name: 'Chips Paprika', quantity: 1, unitPrice: 199, totalPrice: 199, options: [] },
        ],
        customer: { name: 'Max Mustermann', phone: '+43 699 12345678', email: null },
        deliveryAddress: { street: 'Testgasse 1', city: 'Wien', zip: '1010', notes: 'Bitte klingeln' },
        paymentMethod: 'online_paid' as const,
        totalAmount: 797,
        notes: 'Testbestellung — bitte ignorieren',
        receiptId: null,
      };
      fastify.realtime.emitNewOrder(request.tenantId, mockOrder);
      return reply.send({ success: true, data: mockOrder });
    },
  );

  /** POST /orders/:id/receipt */
  fastify.post('/orders/:id/receipt', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createReceiptSchema.parse(request.body);
    const receipt = await service.createReceiptFromOrder(
      request.tenantId,
      request.jwtPayload.sub,
      id,
      body.payment,
    );
    return reply.code(201).send({ success: true, data: receipt });
  });
}
