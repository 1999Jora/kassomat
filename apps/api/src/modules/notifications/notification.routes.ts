import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { notificationService } from './notification.service';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const registerDeviceSchema = z.object({
  token: z.string().min(1, 'FCM Token ist erforderlich'),
  platform: z.enum(['android', 'ios', 'web']),
});

const unregisterDeviceSchema = z.object({
  token: z.string().min(1, 'FCM Token ist erforderlich'),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /devices/register — Register an FCM device token
   * Requires authentication.
   */
  fastify.post(
    '/devices/register',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = registerDeviceSchema.parse(request.body);
      await notificationService.registerDevice(
        request.jwtPayload.sub,
        request.tenantId,
        body.token,
        body.platform,
      );
      return reply.send({ success: true });
    },
  );

  /**
   * DELETE /devices/unregister — Unregister an FCM device token
   * Requires authentication.
   */
  fastify.delete(
    '/devices/unregister',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = unregisterDeviceSchema.parse(request.body);
      await notificationService.unregisterDevice(body.token);
      return reply.send({ success: true });
    },
  );
}
