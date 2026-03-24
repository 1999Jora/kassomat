import * as argon2 from 'argon2';
import { v4 as uuid } from 'uuid';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { UnauthorizedError, NotFoundError } from '../../lib/errors';
import type { FastifyInstance } from 'fastify';

const REFRESH_EXPIRY_DAYS = 30;
const REFRESH_EXPIRY_MS = REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(private readonly fastify: FastifyInstance) {}

  /** Login: E-Mail + Passwort → Access Token + Refresh Token */
  async login(email: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
            trialEndsAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) throw new UnauthorizedError('E-Mail oder Passwort falsch');

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedError('E-Mail oder Passwort falsch');

    // lastLoginAt aktualisieren
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.fastify.jwt.sign({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        name: user.name,
        createdAt: user.createdAt,
        lastLoginAt: new Date(),
      },
      tenant: user.tenant,
    };
  }

  /** Refresh Token → neues Access Token + neues Refresh Token (rotation) */
  async refresh(refreshToken: string) {
    // Blacklist-Check
    const blacklisted = await redis.get(`blacklist:${refreshToken}`);
    if (blacklisted) throw new UnauthorizedError('Refresh Token ungültig');

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.isRevoked) {
      throw new UnauthorizedError('Refresh Token ungültig');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh Token abgelaufen');
    }

    // Alten Token revoken
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true },
    });

    const newAccessToken = this.fastify.jwt.sign({
      sub: tokenRecord.user.id,
      tenantId: tokenRecord.user.tenantId,
      role: tokenRecord.user.role,
    });

    const newRefreshToken = await this.createRefreshToken(tokenRecord.user.id);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  /** Logout: Refresh Token invalidieren */
  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { isRevoked: true },
    });

    // Auch in Redis-Blacklist setzen (für sofortige Invalidierung)
    await redis.set(`blacklist:${refreshToken}`, '1', 'EX', REFRESH_EXPIRY_DAYS * 24 * 3600);
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const token = uuid();
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

    await prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });

    return token;
  }
}
