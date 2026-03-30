import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service';
import { checkLoginRateLimit, recordFailedLogin, clearFailedLogins } from '../../lib/rate-limiter';

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

    // Rate limit check
    const ip = request.ip;
    const rateLimitResult = checkLoginRateLimit(body.email, ip);
    if (!rateLimitResult.allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(rateLimitResult.retryAfterSeconds ?? 60))
        .send({ success: false, error: rateLimitResult.message });
    }

    try {
      const result = await authService.login(body.email, body.password);
      clearFailedLogins(body.email);
      return reply.code(200).send({ success: true, data: result });
    } catch (err) {
      recordFailedLogin(body.email);
      throw err;
    }
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
