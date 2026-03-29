import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ReceiptsService } from './receipts.service';
import { printReceipt, generateDigitalReceiptHTML } from '@kassomat/print';
import type { ReceiptData, TenantInfo, PrinterConfig } from '@kassomat/print';

const createReceiptSchema = z.object({
  cashRegisterId: z.string().default('KASSE-01'),
  channel: z.enum(['direct', 'lieferando', 'wix']).default('direct'),
  externalOrderId: z.string().nullable().optional(),
  incomingOrderId: z.string().uuid().nullable().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1),
    discount: z.number().int().min(0).default(0),
  })).min(1, 'Mindestens eine Position erforderlich'),
  payment: z.object({
    method: z.enum(['cash', 'card', 'online']),
    amountPaid: z.number().int().min(0),
    tip: z.number().int().min(0).default(0),
  }),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().optional(),
  to: z.string().optional(),
  channel: z.enum(['direct', 'lieferando', 'wix']).optional(),
  status: z.enum(['pending', 'signed', 'printed', 'cancelled']).optional(),
});

// ============================================================
// Helper: map Prisma VatRate enum string to numeric VAT rate
// ============================================================

function toNumericVatRate(vatRate: string): 0 | 10 | 13 | 20 {
  switch (vatRate) {
    case 'VAT_0':  return 0;
    case 'VAT_10': return 10;
    case 'VAT_13': return 13;
    case 'VAT_20': return 20;
    default:       return 20;
  }
}

// ============================================================
// Helper: build PrinterConfig from environment variables
// ============================================================

function getPrinterConfig(): PrinterConfig {
  const printerType = (process.env['PRINTER_TYPE'] ?? 'file') as 'usb' | 'network' | 'file';

  if (printerType === 'network') {
    const host = process.env['PRINTER_HOST'];
    const port = process.env['PRINTER_PORT'] ? parseInt(process.env['PRINTER_PORT'], 10) : 9100;
    if (!host) {
      throw new Error('PRINTER_HOST environment variable is required when PRINTER_TYPE=network');
    }
    return { type: 'network', host, port };
  }

  if (printerType === 'usb') {
    return { type: 'usb', usbPath: process.env['PRINTER_USB_PATH'] };
  }

  // Default: file output for development / testing
  const outputPath = process.env['PRINTER_FILE_PATH'] ?? '/tmp/kassomat-last-receipt.bin';
  return { type: 'file', outputPath };
}

// ============================================================
// Routes
// ============================================================

export async function receiptsRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new ReceiptsService();

  /** GET /receipts */
  fastify.get('/receipts', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const result = await service.list(request.tenantId, query);
    return reply.send({ success: true, data: result });
  });

  /** POST /receipts */
  fastify.post('/receipts', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createReceiptSchema.parse(request.body);
    const receipt = await service.create(request.tenantId, request.jwtPayload.sub, body);
    return reply.code(201).send({ success: true, data: receipt });
  });

  /** GET /receipts/:id */
  fastify.get('/receipts/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const receipt = await service.getById(request.tenantId, id);
    return reply.send({ success: true, data: receipt });
  });

  /** POST /receipts/:id/cancel */
  fastify.post('/receipts/:id/cancel', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().optional() }).parse(request.body ?? {});
    const receipt = await service.cancel(request.tenantId, request.jwtPayload.sub, id, body.reason);
    return reply.code(201).send({ success: true, data: receipt });
  });

  /** GET /receipts/:id/print — Build ESC/POS bytes and dispatch to printer */
  fastify.get('/receipts/:id/print', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const receipt = await service.getById(request.tenantId, id);

    if (!receipt.rksv.signedAt) {
      return reply.code(202).send({
        success: false,
        error: { code: 'NOT_SIGNED_YET', message: 'Bon wird noch signiert. Bitte einen Moment warten.' },
      });
    }

    const tenant = await fastify.prisma.tenant.findUnique({ where: { id: request.tenantId } });
    if (!tenant) {
      return reply.code(404).send({ success: false, error: { code: 'TENANT_NOT_FOUND', message: 'Tenant nicht gefunden.' } });
    }

    // Load cashier name for the receipt
    const cashier = await fastify.prisma.user.findUnique({
      where: { id: receipt.cashierId },
      select: { name: true },
    });

    // Build ReceiptData for the print package
    const receiptData: ReceiptData = {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      cashRegisterId: receipt.cashRegisterId,
      type: receipt.type as ReceiptData['type'],
      createdAt: receipt.createdAt,
      cashierName: cashier?.name ?? receipt.cashierId,
      items: receipt.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate as 0 | 10 | 13 | 20,
        discount: item.discount,
        totalNet: item.totalNet,
        totalVat: item.totalVat,
        totalGross: item.totalGross,
      })),
      payment: {
        method: receipt.payment.method,
        amountPaid: receipt.payment.amountPaid,
        change: receipt.payment.change,
        tip: receipt.payment.tip,
      },
      totals: {
        subtotalNet: receipt.totals.subtotalNet,
        vat0: receipt.totals.vat0,
        vat10: receipt.totals.vat10,
        vat13: receipt.totals.vat13,
        vat20: receipt.totals.vat20,
        totalVat: receipt.totals.totalVat,
        totalGross: receipt.totals.totalGross,
      },
      rksvQrCodeData: receipt.rksv.qrCodeData || null,
      rksvBelegnummer: receipt.rksv.belegnummer || null,
      rksvRegistrierkasseId: receipt.rksv.registrierkasseId || null,
      rksvCertSerial: receipt.rksv.atCertificateSerial || null,
    };

    const tenantInfo: TenantInfo = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      address: tenant.address ?? undefined,
      city: tenant.city ?? undefined,
      vatNumber: tenant.vatNumber ?? null,
      receiptFooter: tenant.receiptFooter ?? null,
      printerIp: tenant.printerIp ?? null,
      printerPort: tenant.printerPort ?? null,
      logoBase64: tenant.logoBase64 ?? null,
    };

    // Determine printer config: prefer tenant's network printer if configured
    let config: PrinterConfig;
    if (tenantInfo.printerIp) {
      config = {
        type: 'network',
        host: tenantInfo.printerIp,
        port: tenantInfo.printerPort ?? 9100,
      };
    } else {
      config = getPrinterConfig();
    }

    await printReceipt(receiptData, tenantInfo, config);

    // Mark receipt as printed
    await fastify.prisma.receipt.update({
      where: { id: receipt.id },
      data: { status: 'printed' },
    });

    const baseUrl = process.env['DIGITAL_RECEIPT_URL'] ?? `${process.env['API_URL'] ?? 'http://localhost:3000'}`;
    const digitalUrl = `${baseUrl}/receipts/${receipt.id}/digital`;

    return reply.send({
      success: true,
      data: {
        receiptUrl: digitalUrl,
      },
    });
  });

  /** GET /receipts/:id/digital — Return HTML digital receipt */
  fastify.get('/receipts/:id/digital', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Digital receipts are publicly accessible (no auth required) so customers
    // can open a link sent by email. We still scope by receipt ID.
    const receipt = await fastify.prisma.receipt.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!receipt) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Bon nicht gefunden.' } });
    }

    const tenant = await fastify.prisma.tenant.findUnique({ where: { id: receipt.tenantId } });
    if (!tenant) {
      return reply.code(404).send({ success: false, error: { code: 'TENANT_NOT_FOUND', message: 'Tenant nicht gefunden.' } });
    }

    const cashier = await fastify.prisma.user.findUnique({
      where: { id: receipt.cashierId },
      select: { name: true },
    });

    const receiptData: ReceiptData = {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      cashRegisterId: receipt.cashRegisterId,
      type: receipt.type as ReceiptData['type'],
      createdAt: receipt.createdAt,
      cashierName: cashier?.name ?? receipt.cashierId,
      items: receipt.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: toNumericVatRate(item.vatRate),
        discount: item.discount,
        totalNet: item.totalNet,
        totalVat: item.totalVat,
        totalGross: item.totalGross,
      })),
      payment: {
        method: receipt.paymentMethod as 'cash' | 'card' | 'online',
        amountPaid: receipt.amountPaid,
        change: receipt.change,
        tip: receipt.tip,
      },
      totals: {
        subtotalNet: receipt.subtotalNet,
        vat0: receipt.vat0,
        vat10: receipt.vat10,
        vat13: receipt.vat13,
        vat20: receipt.vat20,
        totalVat: receipt.totalVat,
        totalGross: receipt.totalGross,
      },
      rksvQrCodeData: receipt.rksv_qrCodeData ?? null,
      rksvBelegnummer: receipt.rksv_belegnummer ?? null,
      rksvRegistrierkasseId: receipt.rksv_registrierkasseId ?? null,
      rksvCertSerial: receipt.rksv_atCertificateSerial ?? null,
    };

    const tenantInfo: TenantInfo = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      address: tenant.address ?? undefined,
      city: tenant.city ?? undefined,
      vatNumber: tenant.vatNumber ?? null,
      receiptFooter: tenant.receiptFooter ?? null,
      printerIp: tenant.printerIp ?? null,
      printerPort: tenant.printerPort ?? null,
      logoBase64: tenant.logoBase64 ?? null,
    };

    const html = await generateDigitalReceiptHTML(receiptData, tenantInfo);

    return reply.type('text/html').send(html);
  });

  /** POST /receipts/null — Nullbeleg */
  fastify.post('/receipts/null', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const receipt = await service.createNullReceipt(request.tenantId, request.jwtPayload.sub);
    return reply.code(201).send({ success: true, data: receipt });
  });

  /** POST /receipts/training — Trainingsbeleg */
  fastify.post('/receipts/training', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const receipt = await service.createTrainingReceipt(request.tenantId, request.jwtPayload.sub);
    return reply.code(201).send({ success: true, data: receipt });
  });

  /** POST /receipts/closing — Schlussbeleg (Kasse außer Betrieb) */
  fastify.post('/receipts/closing', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({
      cashRegisterId: z.string().default('KASSE-01'),
    }).parse(request.body ?? {});
    const receipt = await service.createClosingReceipt(request.tenantId, request.jwtPayload.sub, body.cashRegisterId);
    return reply.code(201).send({ success: true, data: receipt });
  });
}
