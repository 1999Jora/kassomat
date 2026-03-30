import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as argon2 from 'argon2';
import { prisma } from '../../lib/prisma.js';

// Cast to any until prisma generate picks up the new Delivery model
const db = prisma as any;

/**
 * Verify driver PIN from x-driver-pin header against the driver record.
 * Returns the verified driver or throws 401.
 */
async function verifyDriverPin(
  req: FastifyRequest,
  reply: FastifyReply,
  driverId: string,
): Promise<{ id: string; tenantId: string; name: string }> {
  const pin = req.headers['x-driver-pin'];
  if (!pin || typeof pin !== 'string') {
    return reply.status(401).send({ error: 'x-driver-pin header required' });
  }
  const driver = await db.driver.findFirst({
    where: { id: driverId, isActive: true },
  });
  if (!driver) {
    return reply.status(401).send({ error: 'Falscher PIN oder Fahrer nicht gefunden' });
  }
  const valid = await argon2.verify(driver.pin, pin);
  if (!valid) {
    return reply.status(401).send({ error: 'Falscher PIN oder Fahrer nicht gefunden' });
  }
  return driver;
}

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
    async (req, reply) => {
      // Look up the delivery to find the assigned driver
      const delivery = await db.delivery.findUnique({
        where: { id: req.params.id },
        select: { driverId: true },
      });
      if (!delivery?.driverId) {
        return reply.status(404).send({ error: 'Lieferung nicht gefunden oder kein Fahrer zugewiesen' });
      }

      // Verify the driver PIN
      await verifyDriverPin(req, reply, delivery.driverId);

      const updated = await db.delivery.update({
        where: { id: req.params.id },
        data: { status: 'picked_up', pickedUpAt: new Date() },
        include: { driver: true, order: { include: { items: true } } },
      });
      app.realtime.emitDeliveryUpdate(updated.tenantId, updated);
      return updated;
    }
  );

  // POST /deliveries/:id/delivered — mark stop as done
  app.post<{ Params: { id: string } }>(
    '/deliveries/:id/delivered',
    async (req, reply) => {
      // Look up the delivery to find the assigned driver
      const delivery = await db.delivery.findUnique({
        where: { id: req.params.id },
        select: { driverId: true },
      });
      if (!delivery?.driverId) {
        return reply.status(404).send({ error: 'Lieferung nicht gefunden oder kein Fahrer zugewiesen' });
      }

      // Verify the driver PIN
      await verifyDriverPin(req, reply, delivery.driverId);

      const updated = await db.delivery.update({
        where: { id: req.params.id },
        data: { status: 'delivered', deliveredAt: new Date() },
        include: { driver: true, order: { include: { items: true } } },
      });
      // Also update the incoming order status
      await prisma.incomingOrder.update({
        where: { id: updated.orderId },
        data: { status: 'completed' },
      });
      app.realtime.emitDeliveryUpdate(updated.tenantId, updated);
      return updated;
    }
  );

  // GET /deliveries/driver/:driverId — driver's active deliveries
  app.get<{ Params: { driverId: string } }>(
    '/deliveries/driver/:driverId',
    async (req, reply) => {
      // Verify the driver PIN matches this driver
      await verifyDriverPin(req, reply, req.params.driverId);

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
