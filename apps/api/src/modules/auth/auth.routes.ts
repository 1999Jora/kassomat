import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service';

const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(1, 'Passwort erforderlich'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token erforderlich'),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService(fastify);

  /** POST /auth/login */
  fastify.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await authService.login(body.email, body.password);
    return reply.code(200).send({ success: true, data: result });
  });

  /** POST /auth/refresh */
  fastify.post('/auth/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const result = await authService.refresh(body.refreshToken);
    return reply.code(200).send({ success: true, data: result });
  });

  /** POST /auth/logout */
  fastify.post(
    '/auth/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = refreshSchema.parse(request.body);
      await authService.logout(body.refreshToken);
      return reply.code(200).send({ success: true });
    },
  );
}
