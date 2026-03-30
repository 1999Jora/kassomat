import { FastifyInstance } from 'fastify';
import * as argon2 from 'argon2';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middleware/auth.js';

// Cast to any until prisma generate picks up the new Driver model
const db = prisma as any;

export async function driversRoutes(app: FastifyInstance) {
  // GET /drivers — list all drivers (auth = full data, no auth = public list ohne PIN)
  app.get('/drivers', async (req, reply) => {
    try {
      await (app.authenticate as any)(req, reply);
    } catch {
      // Nicht eingeloggt → öffentliche Liste ohne PIN (für Fahrer-Login Ansicht)
      // tenantId kommt aus Query-Parameter
      const tenantId = (req.query as any).tenantId as string | undefined;
      if (!tenantId) return reply.status(400).send({ error: 'tenantId required' });
      const drivers = await db.driver.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, color: true, isActive: true, sortOrder: true },
      });
      return drivers;
    }
    // Eingeloggt → volle Daten inkl. PIN
    const tenantId = (req.user as any).tenantId;
    return db.driver.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  });

  // POST /drivers — create driver
  app.post<{ Body: { name: string; pin: string; color?: string } }>(
    '/drivers',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req) => {
      const tenantId = (req.user as any).tenantId;
      const { name, pin, color } = req.body;
      const hashedPin = await argon2.hash(pin);
      return db.driver.create({
        data: { tenantId, name, pin: hashedPin, color: color ?? '#4f8ef7' },
      });
    }
  );

  // PUT /drivers/:id — update driver
  app.put<{ Params: { id: string }; Body: { name?: string; pin?: string; color?: string; isActive?: boolean } }>(
    '/drivers/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
    async (req) => {
      const tenantId = (req.user as any).tenantId;
      const data = { ...req.body };
      if (data.pin) {
        data.pin = await argon2.hash(data.pin);
      }
      return db.driver.update({
        where: { id: req.params.id, tenantId },
        data,
      });
    }
  );

  // DELETE /drivers/:id
  app.delete<{ Params: { id: string } }>(
    '/drivers/:id',
    { preHandler: [app.authenticate, requireRole('owner', 'admin')] },
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
        where: { id: driverId, isActive: true },
      });
      if (!driver) return reply.status(401).send({ error: 'Falscher PIN' });
      const valid = await argon2.verify(driver.pin, pin);
      if (!valid) return reply.status(401).send({ error: 'Falscher PIN' });
      return { ok: true, driver };
    }
  );
}
