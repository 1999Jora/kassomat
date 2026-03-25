import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';

// Cast to any until prisma generate picks up the new Driver model
const db = prisma as any;

export async function driversRoutes(app: FastifyInstance) {
  // GET /drivers — list all drivers for tenant
  app.get('/drivers', { onRequest: [app.authenticate] }, async (req) => {
    const tenantId = (req.user as any).tenantId;
    return db.driver.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  });

  // POST /drivers — create driver
  app.post<{ Body: { name: string; pin: string; color?: string } }>(
    '/drivers',
    { onRequest: [app.authenticate] },
    async (req) => {
      const tenantId = (req.user as any).tenantId;
      const { name, pin, color } = req.body;
      return db.driver.create({
        data: { tenantId, name, pin, color: color ?? '#4f8ef7' },
      });
    }
  );

  // PUT /drivers/:id — update driver
  app.put<{ Params: { id: string }; Body: { name?: string; pin?: string; color?: string; isActive?: boolean } }>(
    '/drivers/:id',
    { onRequest: [app.authenticate] },
    async (req) => {
      const tenantId = (req.user as any).tenantId;
      return db.driver.update({
        where: { id: req.params.id, tenantId },
        data: req.body,
      });
    }
  );

  // DELETE /drivers/:id
  app.delete<{ Params: { id: string } }>(
    '/drivers/:id',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const tenantId = (req.user as any).tenantId;
      await db.driver.delete({ where: { id: req.params.id, tenantId } });
      return reply.send({ ok: true });
    }
  );

  // POST /drivers/verify-pin — verify driver pin (no auth needed, returns driver info)
  app.post<{ Body: { driverId: string; pin: string } }>(
    '/drivers/verify-pin',
    async (req, reply) => {
      const { driverId, pin } = req.body;
      const driver = await db.driver.findFirst({
        where: { id: driverId, pin, isActive: true },
      });
      if (!driver) return reply.status(401).send({ error: 'Falscher PIN' });
      return { ok: true, driver };
    }
  );
}
