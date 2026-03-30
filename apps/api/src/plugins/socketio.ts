import fp from 'fastify-plugin';
import { Server as SocketIOServer } from 'socket.io';
import * as argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import type { JWTPayload } from '@kassomat/types';
import { RealtimeService } from '../modules/realtime/realtime.service';
import { prisma } from '../lib/prisma';

// Cast to any until prisma generate picks up the Driver model
const db = prisma as any;

// ---------------------------------------------------------------------------
// Extend FastifyInstance with io and realtime decorations
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
    realtime: RealtimeService;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default fp(async (fastify: FastifyInstance) => {
  const corsOrigin = (process.env['CORS_ORIGIN'] ?? 'http://localhost:5173').split(',');
  // Capacitor Android/iOS apps use these origins
  const capacitorOrigins = ['https://localhost', 'capacitor://localhost', 'http://localhost'];
  const allOrigins = [...corsOrigin, ...capacitorOrigins];

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: process.env['NODE_ENV'] === 'development' ? true : allOrigins,
      credentials: true,
    },
    // Transports: prefer WebSocket, fall back to long-polling
    transports: ['websocket', 'polling'],
  });

  // --------------------------------------------------------------------------
  // Auth middleware — verify JWT or driver PIN on every connection attempt.
  // If a valid JWT is provided, use it. Otherwise require driverPin + driverId
  // in the handshake query and verify against the DB. If neither is valid,
  // reject the connection.
  // --------------------------------------------------------------------------
  io.use(async (socket, next) => {
    // The client must pass the JWT either as a query param or in the auth object
    const token: unknown =
      socket.handshake.auth?.['token'] ??
      socket.handshake.query?.['token'];

    if (token && typeof token === 'string') {
      try {
        // Re-use the Fastify JWT plugin's verification
        const payload = fastify.jwt.verify<JWTPayload>(token);
        // Attach payload so we can access tenantId in the connect handler
        (socket as typeof socket & { jwtPayload: JWTPayload }).jwtPayload = payload;
        return next();
      } catch {
        return next(new Error('Authentication error: invalid or expired token'));
      }
    }

    // No JWT — try driver PIN auth
    const driverPin: unknown =
      socket.handshake.auth?.['driverPin'] ??
      socket.handshake.query?.['driverPin'];
    const driverId: unknown =
      socket.handshake.auth?.['driverId'] ??
      socket.handshake.query?.['driverId'];

    if (driverPin && typeof driverPin === 'string' && driverId && typeof driverId === 'string') {
      try {
        const driver = await db.driver.findFirst({
          where: { id: driverId, isActive: true },
          select: { id: true, tenantId: true, name: true, pin: true },
        });
        if (driver && await argon2.verify(driver.pin, driverPin)) {
          // Attach verified tenantId from DB (never trust client-supplied tenantId)
          (socket as typeof socket & { verifiedTenantId: string }).verifiedTenantId = driver.tenantId;
          (socket as typeof socket & { driverId: string }).driverId = driver.id;
          return next();
        }
      } catch {
        // DB error — fall through to reject
      }
      return next(new Error('Authentication error: invalid driver credentials'));
    }

    // Neither JWT nor valid driver credentials — reject
    return next(new Error('Authentication required'));
  });

  // --------------------------------------------------------------------------
  // Connection handler — join the tenant room
  // --------------------------------------------------------------------------
  io.on('connection', (socket) => {
    const payload = (socket as typeof socket & { jwtPayload?: JWTPayload }).jwtPayload;
    const verifiedTenantId = (socket as typeof socket & { verifiedTenantId?: string }).verifiedTenantId;

    // tenantId from JWT or from verified driver lookup — NEVER from client query
    const tenantId: string | undefined = payload?.tenantId ?? verifiedTenantId;

    if (tenantId) {
      const room = `tenant_${tenantId}`;
      void socket.join(room);
      fastify.log.info(
        { socketId: socket.id, tenantId, room },
        '[Socket.io] Client connected and joined room',
      );
    } else {
      fastify.log.info(
        { socketId: socket.id },
        '[Socket.io] Client connected without tenantId',
      );
    }

    // Relay GPS from driver to all clients in the tenant room
    socket.on('driver:gps', (data: { driverId: string; lat: number; lng: number; heading?: number; speed?: number }) => {
      // Only emit to the verified tenant room — ignore any client-supplied tenantId
      const room = `tenant_${tenantId}`;
      if (tenantId) {
        socket.to(room).emit('driver:gps', data);
      }
    });

    socket.on('disconnect', (reason) => {
      fastify.log.info(
        { socketId: socket.id, tenantId, reason },
        '[Socket.io] Client disconnected',
      );
    });
  });

  // --------------------------------------------------------------------------
  // Decorate Fastify with `io` and `realtime`
  // --------------------------------------------------------------------------
  const realtimeService = new RealtimeService(io);

  fastify.decorate('io', io);
  fastify.decorate('realtime', realtimeService);

  // --------------------------------------------------------------------------
  // Graceful shutdown — close Socket.io with Fastify
  // --------------------------------------------------------------------------
  fastify.addHook('onClose', (_instance, done) => {
    io.close(() => done());
  });
});
