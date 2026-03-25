import fp from 'fastify-plugin';
import { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import type { JWTPayload } from '@kassomat/types';
import { RealtimeService } from '../modules/realtime/realtime.service';

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

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: process.env['NODE_ENV'] === 'development' ? true : corsOrigin,
      credentials: true,
    },
    // Transports: prefer WebSocket, fall back to long-polling
    transports: ['websocket', 'polling'],
  });

  // --------------------------------------------------------------------------
  // Auth middleware — verify JWT on every connection attempt
  // Drivers may connect without JWT (they use driver PIN auth instead).
  // If a token is provided it is verified; otherwise the socket is marked
  // as unauthenticated and must supply tenantId via handshake query/auth.
  // --------------------------------------------------------------------------
  io.use((socket, next) => {
    // The client must pass the JWT either as a query param or in the auth object
    const token: unknown =
      socket.handshake.auth?.['token'] ??
      socket.handshake.query?.['token'];

    if (!token || typeof token !== 'string') {
      // Allow unauthenticated connections (e.g. driver GPS clients)
      return next();
    }

    try {
      // Re-use the Fastify JWT plugin's verification
      const payload = fastify.jwt.verify<JWTPayload>(token);
      // Attach payload so we can access tenantId in the connect handler
      (socket as typeof socket & { jwtPayload: JWTPayload }).jwtPayload = payload;
      return next();
    } catch {
      return next(new Error('Authentication error: invalid or expired token'));
    }
  });

  // --------------------------------------------------------------------------
  // Connection handler — join the tenant room
  // --------------------------------------------------------------------------
  io.on('connection', (socket) => {
    const payload = (socket as typeof socket & { jwtPayload?: JWTPayload }).jwtPayload;

    // For authenticated connections, join the tenant room
    let tenantId: string | undefined = payload?.tenantId;

    if (tenantId) {
      const room = `tenant_${tenantId}`;
      void socket.join(room);

      fastify.log.info(
        { socketId: socket.id, tenantId, room },
        '[Socket.io] Client connected and joined room',
      );
    } else {
      // Unauthenticated driver connection — tenantId may come via GPS events
      fastify.log.info(
        { socketId: socket.id },
        '[Socket.io] Unauthenticated client connected (driver)',
      );
    }

    // Relay GPS from driver to all clients in the tenant room
    socket.on('driver:gps', (data: { driverId: string; tenantId?: string; lat: number; lng: number; heading?: number; speed?: number }) => {
      const room = `tenant_${tenantId ?? data.tenantId}`;
      if (room !== 'tenant_undefined') {
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
