import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ProductsService } from './products.service';
import { requireRole } from '../../middleware/auth';

const createProductSchema = z.object({
  name: z.string().min(1, 'Name erforderlich'),
  price: z.number().int().min(0, 'Preis muss >= 0 sein'),
  vatRate: z.union([z.literal(0), z.literal(10), z.literal(20)]),
  categoryId: z.string().uuid('Ungültige Kategorie-ID'),
  pluCode: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Ungültiges Farbformat').nullable().optional(),
  lieferandoExternalId: z.string().nullable().optional(),
  wixProductId: z.string().nullable().optional(),
});

const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const createCategorySchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6B7280'),
  sortOrder: z.number().int().default(0),
});

export async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new ProductsService();

  /** GET /products */
  fastify.get('/products', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const result = await service.list(request.tenantId, query);
    return reply.send({ success: true, data: result });
  });

  /** POST /products */
  fastify.post(
    '/products',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const body = createProductSchema.parse(request.body);
      const product = await service.create(request.tenantId, body);
      return reply.code(201).send({ success: true, data: product });
    },
  );

  /** PATCH /products/:id */
  fastify.patch(
    '/products/:id',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateProductSchema.parse(request.body);
      const product = await service.update(request.tenantId, id, body);
      return reply.send({ success: true, data: product });
    },
  );

  /** DELETE /products/:id */
  fastify.delete(
    '/products/:id',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await service.delete(request.tenantId, id);
      return reply.send({ success: true });
    },
  );

  /** POST /products/import — CSV Bulk-Import */
  fastify.post(
    '/products/import',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) return reply.code(400).send({ success: false, error: { code: 'NO_FILE', message: 'Keine Datei hochgeladen' } });

      const buffer = await data.toBuffer();
      const result = await service.importCSV(request.tenantId, buffer);
      return reply.send({ success: true, data: result });
    },
  );

  /** GET /categories */
  fastify.get('/categories', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const categories = await fastify.prisma.category.findMany({
      where: { tenantId: request.tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    return reply.send({ success: true, data: categories });
  });

  /** POST /categories */
  fastify.post(
    '/categories',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const body = createCategorySchema.parse(request.body);
      const category = await fastify.prisma.category.create({
        data: { tenantId: request.tenantId, ...body },
      });
      return reply.code(201).send({ success: true, data: category });
    },
  );

  /** PATCH /categories/:id */
  fastify.patch(
    '/categories/:id',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = createCategorySchema.partial().parse(request.body);

      // Tenant-Isolation check
      const existing = await fastify.prisma.category.findFirst({
        where: { id, tenantId: request.tenantId },
      });
      if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Kategorie nicht gefunden' } });

      const updated = await fastify.prisma.category.update({
        where: { id },
        data: body,
      });
      return reply.send({ success: true, data: updated });
    },
  );
}
