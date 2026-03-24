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
  // --------------------------------------------------------------------------
  io.use((socket, next) => {
    // The client must pass the JWT either as a query param or in the auth object
    const token: unknown =
      socket.handshake.auth?.['token'] ??
      socket.handshake.query?.['token'];

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication error: missing token'));
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

    if (!payload?.tenantId) {
      fastify.log.warn('[Socket.io] Connection without tenantId in JWT — disconnecting');
      socket.disconnect(true);
      return;
    }

    const room = `tenant_${payload.tenantId}`;
    void socket.join(room);

    fastify.log.info(
      { socketId: socket.id, tenantId: payload.tenantId, room },
      '[Socket.io] Client connected and joined room',
    );

    socket.on('disconnect', (reason) => {
      fastify.log.info(
        { socketId: socket.id, tenantId: payload.tenantId, reason },
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
