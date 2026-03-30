import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';

import prismaPlugin from './plugins/prisma';
import jwtPlugin from './plugins/jwt';
import authenticatePlugin from './plugins/authenticate';
import socketioPlugin from './plugins/socketio';

import { authRoutes } from './modules/auth/auth.routes';
import { tenantRoutes } from './modules/tenant/tenant.routes';
import { productsRoutes } from './modules/products/products.routes';
import { receiptsRoutes } from './modules/receipts/receipts.routes';
import { ordersRoutes } from './modules/orders/orders.routes';
import { closingRoutes } from './modules/closing/closing.routes';
import { webhooksRoutes } from './modules/webhooks/webhooks.routes';
import { myposRoutes } from './modules/mypos/mypos.routes';
import { wixRoutes } from './modules/wix/wix.routes';
import { driversRoutes } from './modules/drivers/drivers.routes';
import { deliveryRoutes } from './modules/delivery/delivery.routes';
import { mergeportRoutes } from './modules/mergeport/mergeport.routes';
import { startMergeportPoller, stopMergeportPoller } from './modules/mergeport/mergeport.poller';

import { AppError } from './lib/errors';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = '0.0.0.0';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      ...(process.env['NODE_ENV'] === 'development' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
  });

  // ---- Plugins ----
  await fastify.register(cors, {
    origin: (origin, callback) => {
      const allowed = (process.env['CORS_ORIGIN'] ?? 'http://localhost:5173')
        .split(',')
        .map(o => o.trim());
      if (!origin || process.env['NODE_ENV'] === 'development' || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
  });

  await fastify.register(helmet, { contentSecurityPolicy: false });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Rate-limit pro Tenant, nicht pro IP
      const auth = request.headers.authorization;
      if (auth) {
        try {
          const token = auth.split(' ')[1];
          if (token) {
            const payload = JSON.parse(
              Buffer.from(token.split('.')[1] ?? '', 'base64').toString(),
            ) as { tenantId?: string };
            if (payload.tenantId) return `tenant:${payload.tenantId}`;
          }
        } catch { /* fall through to IP */ }
      }
      return request.ip;
    },
  });

  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

  await fastify.register(prismaPlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(authenticatePlugin);
  await fastify.register(socketioPlugin);

  // ---- Global Error Handler ----
  fastify.setErrorHandler((error, request, reply) => {
    const log = request.log;

    // Zod Validierungsfehler
    if (error instanceof ZodError) {
      const details: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.') || 'root';
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validierungsfehler', details },
      });
    }

    // Strukturierte App-Fehler
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        log.error({ err: error }, 'Application error');
      }
      return reply.code(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    // Fastify JWT Fehler
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Ungültiger oder abgelaufener Token' },
      });
    }

    // Rate-Limit Fehler
    if (error.statusCode === 429) {
      return reply.code(429).send({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Zu viele Anfragen. Bitte warte einen Moment.' },
      });
    }

    // Unbekannte Fehler
    log.error({ err: error }, 'Unhandled error');
    return reply.code(500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Ein interner Fehler ist aufgetreten' },
    });
  });

  // ---- Health Check ----
  fastify.get('/health', async () => ({
    status: 'ok',
    version: '1.0.1',
    timestamp: new Date().toISOString(),
  }));

  // ---- Routes ----
  await fastify.register(authRoutes);
  await fastify.register(tenantRoutes);
  await fastify.register(productsRoutes);
  await fastify.register(receiptsRoutes);
  await fastify.register(ordersRoutes);
  await fastify.register(closingRoutes);
  await fastify.register(webhooksRoutes);
  await fastify.register(myposRoutes);
  await fastify.register(wixRoutes);
  await fastify.register(driversRoutes);
  await fastify.register(deliveryRoutes);
  await fastify.register(mergeportRoutes);

  // Mergeport Polling nach Server-Start starten
  fastify.addHook('onReady', () => {
    startMergeportPoller(fastify);
  });

  // Mergeport Polling bei Shutdown stoppen
  fastify.addHook('onClose', (_instance, done) => {
    stopMergeportPoller();
    done();
  });

  return fastify;
}

// ---- Start ----
async function start() {
  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });
    server.log.info(`Kassomat API läuft auf http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    server.log.info(`${signal} empfangen — fahre herunter...`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start();
