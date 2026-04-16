import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { requireRole } from '../../middleware/auth';

const tableSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(50),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(2).max(50).default(10),
  height: z.number().min(2).max(50).default(10),
  shape: z.enum(['rect', 'round']).default('rect'),
  seats: z.number().int().min(1).max(50).default(4),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const bulkUpdateSchema = z.object({
  tables: z.array(tableSchema).max(50),
});

export async function tablesRoutes(fastify: FastifyInstance): Promise<void> {
  /** GET /tables — alle aktiven Tische des Tenants */
  fastify.get(
    '/tables',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tables = await prisma.table.findMany({
        where: { tenantId: request.tenantId },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      });
      return reply.send({ success: true, data: tables });
    },
  );

  /** PUT /tables — Bulk-Update: ganzen Tischplan auf einmal speichern */
  fastify.put(
    '/tables',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const { tables } = bulkUpdateSchema.parse(request.body);
      const tenantId = request.tenantId;

      // Transaction: delete removed tables, upsert existing/new ones
      const result = await prisma.$transaction(async (tx) => {
        // Get existing table IDs
        const existing = await tx.table.findMany({
          where: { tenantId },
          select: { id: true },
        });
        const existingIds = new Set(existing.map((t) => t.id));
        const incomingIds = new Set(tables.filter((t) => t.id).map((t) => t.id!));

        // Delete tables that are no longer in the list
        const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
        if (toDelete.length > 0) {
          await tx.table.deleteMany({
            where: { id: { in: toDelete }, tenantId },
          });
        }

        // Upsert each table
        const upserted = [];
        for (const table of tables) {
          const data = {
            label: table.label,
            x: table.x,
            y: table.y,
            width: table.width,
            height: table.height,
            shape: table.shape,
            seats: table.seats,
            sortOrder: table.sortOrder,
            isActive: table.isActive,
          };

          if (table.id && existingIds.has(table.id)) {
            const updated = await tx.table.update({
              where: { id: table.id },
              data,
            });
            upserted.push(updated);
          } else {
            const created = await tx.table.create({
              data: { ...data, tenantId },
            });
            upserted.push(created);
          }
        }

        return upserted;
      });

      return reply.send({ success: true, data: result });
    },
  );

  /** POST /tables — einzelnen Tisch erstellen */
  fastify.post(
    '/tables',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const body = tableSchema.parse(request.body);
      const table = await prisma.table.create({
        data: {
          tenantId: request.tenantId,
          label: body.label,
          x: body.x,
          y: body.y,
          width: body.width,
          height: body.height,
          shape: body.shape,
          seats: body.seats,
          sortOrder: body.sortOrder,
          isActive: body.isActive,
        },
      });
      return reply.code(201).send({ success: true, data: table });
    },
  );

  /** DELETE /tables/:id — einzelnen Tisch löschen */
  fastify.delete<{ Params: { id: string } }>(
    '/tables/:id',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      await prisma.table.deleteMany({
        where: { id: request.params.id, tenantId: request.tenantId },
      });
      return reply.send({ success: true });
    },
  );
}
