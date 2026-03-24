import fp from 'fastify-plugin';
import fjwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import type { JWTPayload } from '@kassomat/types';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');

  await fastify.register(fjwt, {
    secret,
    sign: {
      expiresIn: process.env['JWT_ACCESS_EXPIRY'] ?? '15m',
    },
  });
});
