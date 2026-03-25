import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';

// Cast to any until prisma generate picks up the new Delivery model
const db = prisma as any;

export async function deliveryRoutes(app: FastifyInstance) {
  // GET /deliveries — active deliveries with driver and order info
  app.get('/deliveries', { onRequest: [app.authenticate] }, async (req) => {
    const tenantId = (req.user as any).tenantId;
    const deliveries = await db.delivery.findMany({
      where: { tenantId, status: { not: 'cancelled' } },
      include: {
        driver: true,
        order: { include: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return deliveries;
  });

  // POST /deliveries/:id/assign — assign to driver
  app.post<{ Params: { id: string }; Body: { driverId: string } }>(
    '/deliveries/:id/assign',
    { onRequest: [app.authenticate] },
    async (req) => {
      const tenantId = (req.user as any).tenantId;
      const delivery = await db.delivery.update({
        where: { id: req.params.id, tenantId },
        data: { driverId: req.body.driverId, assignedAt: new Date() },
        include: { driver: true, order: { include: { items: true } } },
      });
      app.realtime.emitDeliveryUpdate(tenantId, delivery);
      return delivery;
    }
  );

  // POST /deliveries/:id/pickup — driver confirms pickup ("Ich bin im Auto")
  app.post<{ Params: { id: string } }>(
    '/deliveries/:id/pickup',
    async (req) => {
      // No auth needed — driver uses this
      const delivery = await db.delivery.update({
        where: { id: req.params.id },
        data: { status: 'picked_up', pickedUpAt: new Date() },
        include: { driver: true, order: { include: { items: true } } },
      });
      app.realtime.emitDeliveryUpdate(delivery.tenantId, delivery);
      return delivery;
    }
  );

  // POST /deliveries/:id/delivered — mark stop as done
  app.post<{ Params: { id: string } }>(
    '/deliveries/:id/delivered',
    async (req) => {
      const delivery = await db.delivery.update({
        where: { id: req.params.id },
        data: { status: 'delivered', deliveredAt: new Date() },
        include: { driver: true, order: { include: { items: true } } },
      });
      // Also update the incoming order status
      await prisma.incomingOrder.update({
        where: { id: delivery.orderId },
        data: { status: 'completed' },
      });
      app.realtime.emitDeliveryUpdate(delivery.tenantId, delivery);
      return delivery;
    }
  );

  // GET /deliveries/driver/:driverId — driver's active deliveries
  app.get<{ Params: { driverId: string } }>(
    '/deliveries/driver/:driverId',
    async (req) => {
      return db.delivery.findMany({
        where: {
          driverId: req.params.driverId,
          status: { in: ['pending', 'picked_up', 'en_route'] },
        },
        include: { order: { include: { items: true } } },
        orderBy: { position: 'asc' },
      });
    }
  );
}
