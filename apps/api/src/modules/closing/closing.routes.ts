import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ClosingService } from './closing.service';
import { requireRole } from '../../middleware/auth';

export async function closingRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new ClosingService();

  /** POST /daily-closing */
  fastify.post(
    '/daily-closing',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const body = z.object({
        cashCount: z.number().int().min(0),
        notes: z.string().optional(),
      }).parse(request.body);

      const result = await service.dailyClose(request.tenantId, request.jwtPayload.sub, body.cashCount, body.notes);
      return reply.code(201).send({ success: true, data: result });
    },
  );

  /** GET /shifts */
  fastify.get(
    '/shifts',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        from: z.string().optional(),
        to: z.string().optional(),
      }).parse(request.query);

      const page = query.page;
      const pageSize = 20;
      const skip = (page - 1) * pageSize;

      const where: Record<string, unknown> = { tenantId: request.tenantId };
      if (query.from || query.to) {
        where['startedAt'] = {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(`${query.to}T23:59:59`) }),
        };
      }

      const [items, total] = await fastify.prisma.$transaction([
        fastify.prisma.shift.findMany({
          where, skip, take: pageSize,
          orderBy: { startedAt: 'desc' },
        }),
        fastify.prisma.shift.count({ where }),
      ]);

      return reply.send({ success: true, data: { items, total, page, pageSize, hasMore: skip + items.length < total } });
    },
  );

  /** POST /shifts/start */
  fastify.post(
    '/shifts/start',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.object({ openingFloat: z.number().int().min(0) }).parse(request.body);
      const shift = await service.startShift(request.tenantId, request.jwtPayload.sub, body.openingFloat);
      return reply.code(201).send({ success: true, data: shift });
    },
  );

  /** POST /shifts/end */
  fastify.post(
    '/shifts/end',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.object({ closingFloat: z.number().int().min(0) }).parse(request.body);
      const shift = await service.endShift(request.tenantId, request.jwtPayload.sub, body.closingFloat);
      return reply.send({ success: true, data: shift });
    },
  );

  /** GET /analytics/today */
  fastify.get(
    '/analytics/today',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const data = await service.analyticsToday(request.tenantId);
      return reply.send({ success: true, data });
    },
  );

  /** GET /analytics/range */
  fastify.get(
    '/analytics/range',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const query = z.object({
        from: z.string(),
        to: z.string(),
      }).parse(request.query);

      const data = await service.analyticsRange(request.tenantId, query.from, query.to);
      return reply.send({ success: true, data });
    },
  );

  /** GET /dep/export */
  fastify.get(
    '/dep/export',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const entries = await fastify.prisma.dEPEntry.findMany({
        where: { tenantId: request.tenantId },
        orderBy: { timestamp: 'asc' },
      });

      const dep = {
        'Belege-Gruppe': [{
          Signaturzertifikat: entries[0]?.rksv_hash ?? '',
          Zertifizierungsstellen: ['A-Trust'],
          'Belege-kompakt': entries.map(e => JSON.stringify(e.rawData)),
        }],
      };

      return reply
        .header('Content-Disposition', `attachment; filename="dep-export-full.json"`)
        .send(dep);
    },
  );

  /** GET /dep/export/range */
  fastify.get(
    '/dep/export/range',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const query = z.object({ from: z.string(), to: z.string() }).parse(request.query);

      const entries = await fastify.prisma.dEPEntry.findMany({
        where: {
          tenantId: request.tenantId,
          timestamp: {
            gte: new Date(`${query.from}T00:00:00`),
            lte: new Date(`${query.to}T23:59:59`),
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      const dep = {
        'Belege-Gruppe': [{
          Signaturzertifikat: entries[0]?.rksv_hash ?? '',
          Zertifizierungsstellen: ['A-Trust'],
          'Belege-kompakt': entries.map(e => JSON.stringify(e.rawData)),
        }],
      };

      return reply
        .header('Content-Disposition', `attachment; filename="dep-export-${query.from}-${query.to}.json"`)
        .send(dep);
    },
  );
}
