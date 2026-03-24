import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma';
import { UnauthorizedError, TenantSuspendedError, TrialExpiredError, ForbiddenError } from '../lib/errors';
import type { JWTPayload, UserRole } from '@kassomat/types';

declare module 'fastify' {
  interface FastifyRequest {
    jwtPayload: JWTPayload;
    tenantId: string;
  }
}

/**
 * Authentifizierungs-Hook.
 * 1. JWT validieren
 * 2. tenantId + userId aus JWT extrahieren
 * 3. Tenant aus DB laden — Subscription-Check
 * 4. Request-Objekt anreichern
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError('Ungültiger oder abgelaufener Token');
  }

  const payload = request.user as JWTPayload;

  // Tenant laden und prüfen
  const tenant = await prisma.tenant.findUnique({
    where: { id: payload.tenantId },
    select: { id: true, status: true, trialEndsAt: true },
  });

  if (!tenant) throw new UnauthorizedError('Tenant nicht gefunden');

  if (tenant.status === 'suspended') throw new TenantSuspendedError();

  if (
    tenant.status === 'trial' &&
    tenant.trialEndsAt !== null &&
    tenant.trialEndsAt < new Date()
  ) {
    throw new TrialExpiredError();
  }

  request.jwtPayload = payload;
  request.tenantId = payload.tenantId;
}

/** Nur für bestimmte Rollen erlaubt */
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const payload = request.user as JWTPayload;
    if (!roles.includes(payload.role)) {
      throw new ForbiddenError(`Diese Aktion erfordert eine der folgenden Rollen: ${roles.join(', ')}`);
    }
  };
}
