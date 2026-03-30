import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { TenantService } from './tenant.service';
import { AuthService } from '../auth/auth.service';
import { requireRole } from '../../middleware/auth';

/** Austrian UID-Nummer: ATU followed by exactly 8 digits (e.g. ATU12345678) */
const vatNumberSchema = z.string().regex(
  /^ATU\d{8}$/,
  'UID-Nummer muss im Format ATU + 8 Ziffern sein (z.B. ATU12345678)',
);

const registerSchema = z.object({
  tenantName: z.string().min(2, 'Firmenname muss mindestens 2 Zeichen haben'),
  ownerEmail: z.string().email('Ungültige E-Mail-Adresse'),
  ownerPassword: z.string().min(8, 'Passwort muss mindestens 8 Zeichen haben'),
  ownerName: z.string().min(1, 'Name erforderlich'),
  vatNumber: vatNumberSchema.nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  receiptFooter: z.string().nullable().optional(),
  printerIp: z.string().nullable().optional(),
  printerPort: z.number().int().min(1).max(65535).nullable().optional(),
  vatNumber: vatNumberSchema.nullable().optional(),
  rksvEnabled: z.boolean().optional(),
  atrust: z.object({
    certificateSerial: z.string().optional(),
    apiKey: z.string().min(1),
    environment: z.enum(['test', 'production']),
  }).nullable().optional(),
  lieferando: z.object({
    restaurantId: z.string().min(1),
    apiKey: z.string().optional(),
    webhookSecret: z.string().optional(),
    isActive: z.boolean(),
  }).nullable().optional(),
  wix: z.object({
    siteId: z.string().min(1),
    apiKey: z.string().optional(),
    webhookSecret: z.string().optional(),
    isActive: z.boolean(),
    defaultDeliveryPayment: z.enum(['cash', 'online']),
  }).nullable().optional(),
  mypos: z.object({
    storeId: z.string().min(1),
    // Optional on update: leave empty to keep existing encrypted value
    apiKey: z.string().optional(),
    secretKey: z.string().optional(),
    terminalSerial: z.string().nullable().optional(),
  }).nullable().optional(),
  fiskaltrust: z.object({
    cashboxId: z.string().min(1),
    accessToken: z.string().optional(),
    environment: z.enum(['sandbox', 'production']).default('sandbox'),
  }).nullable().optional(),
});

export async function tenantRoutes(fastify: FastifyInstance): Promise<void> {
  const tenantService = new TenantService();
  const authService = new AuthService(fastify);

  /** POST /tenant/register — kein Auth nötig */
  fastify.post('/tenant/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const { tenant, owner } = await tenantService.register(body);

    const accessToken = fastify.jwt.sign({
      sub: owner.id,
      tenantId: tenant.id,
      role: owner.role,
    });
    const refreshToken = await authService['createRefreshToken'](owner.id);

    return reply.code(201).send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: owner.id,
          tenantId: owner.tenantId,
          email: owner.email,
          role: owner.role,
          name: owner.name,
          createdAt: owner.createdAt,
          lastLoginAt: null,
        },
        tenant: tenantService['toPublicTenant'](tenant),
      },
    });
  });

  /** GET /tenant */
  fastify.get(
    '/tenant',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await tenantService.getById(request.tenantId);
      return reply.send({ success: true, data: tenant });
    },
  );

  /** PATCH /tenant — nur owner/admin */
  fastify.patch(
    '/tenant',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const body = updateSchema.parse(request.body);
      const tenant = await tenantService.update(request.tenantId, body);
      return reply.send({ success: true, data: tenant });
    },
  );

  /** POST /tenant/logo — Logo hochladen (max 500KB, PNG/JPG) */
  fastify.post(
    '/tenant/logo',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ success: false, error: 'Keine Datei hochgeladen' });

      const mimeType = file.mimetype;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
        return reply.code(400).send({ success: false, error: 'Nur PNG, JPG oder WebP erlaubt' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length > 500 * 1024) {
        return reply.code(400).send({ success: false, error: 'Logo darf maximal 500KB gross sein' });
      }

      const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
      await fastify.prisma.tenant.update({
        where: { id: request.tenantId },
        data: { logoBase64: base64 },
      });

      return reply.send({ success: true, data: { logoBase64: base64 } });
    },
  );

  /** DELETE /tenant/logo — Logo entfernen */
  fastify.delete(
    '/tenant/logo',
    { preHandler: [fastify.authenticate, requireRole('owner', 'admin')] },
    async (request, reply) => {
      await fastify.prisma.tenant.update({
        where: { id: request.tenantId },
        data: { logoBase64: null },
      });
      return reply.send({ success: true });
    },
  );
}
