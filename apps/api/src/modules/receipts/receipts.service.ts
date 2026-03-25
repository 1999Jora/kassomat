import { prisma } from '../../lib/prisma';
import { rksvQueue } from '../../lib/queue';
import { NotFoundError, ValidationError } from '../../lib/errors';
import type { SalesChannel, PaymentMethod, VatRate } from '@kassomat/types';
import type { Prisma } from '@prisma/client';

const VAT_NUM: Record<string, 0 | 10 | 13 | 20> = {
  VAT_0: 0,
  VAT_10: 10,
  VAT_13: 13,
  VAT_20: 20,
};

function toVatEnum(rate: VatRate): 'VAT_0' | 'VAT_10' | 'VAT_13' | 'VAT_20' {
  if (rate === 0) return 'VAT_0';
  if (rate === 10) return 'VAT_10';
  if (rate === 13) return 'VAT_13';
  return 'VAT_20';
}

type ReceiptWithItems = Prisma.ReceiptGetPayload<{ include: { items: true } }>;

/** Map a flat Prisma receipt + items to the nested Receipt API shape */
function toReceiptResponse(receipt: ReceiptWithItems) {
  return {
    id: receipt.id,
    tenantId: receipt.tenantId,
    receiptNumber: receipt.receiptNumber,
    cashRegisterId: receipt.cashRegisterId,
    type: receipt.type,
    status: receipt.status,
    createdAt: receipt.createdAt,
    cashierId: receipt.cashierId,
    channel: receipt.channel,
    externalOrderId: receipt.externalOrderId,
    items: receipt.items.map((item) => ({
      id: item.id,
      receiptId: item.receiptId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      vatRate: (VAT_NUM[item.vatRate] ?? 20) as VatRate,
      discount: item.discount,
      totalNet: item.totalNet,
      totalVat: item.totalVat,
      totalGross: item.totalGross,
    })),
    payment: {
      method: receipt.paymentMethod as PaymentMethod,
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
    rksv: {
      registrierkasseId: receipt.rksv_registrierkasseId ?? '',
      belegnummer: receipt.rksv_belegnummer ?? '',
      barumsatzSumme: receipt.rksv_barumsatzSumme,
      umsatzzaehlerEncrypted: receipt.rksv_umsatzzaehlerEncrypted ?? undefined,
      previousReceiptHash: receipt.rksv_previousReceiptHash ?? '',
      receiptHash: receipt.rksv_receiptHash ?? '',
      signature: receipt.rksv_signature ?? '',
      qrCodeData: receipt.rksv_qrCodeData ?? '',
      signedAt: receipt.rksv_signedAt,
      atCertificateSerial: receipt.rksv_atCertificateSerial ?? '',
    },
  };
}

export interface CreateReceiptItemInput {
  productId: string;
  quantity: number;
  discount?: number;
}

export interface CreateReceiptInput {
  cashRegisterId?: string;
  channel?: SalesChannel;
  externalOrderId?: string | null;
  incomingOrderId?: string | null;
  items: CreateReceiptItemInput[];
  payment: {
    method: PaymentMethod;
    amountPaid: number;
    tip?: number;
  };
}

export class ReceiptsService {
  /** Neuen Bon erstellen, RKSV-Signatur asynchron via Queue */
  async create(tenantId: string, cashierId: string, input: CreateReceiptInput) {
    const productIds = input.items.map(i => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, deletedAt: null },
    });

    if (products.length !== productIds.length) {
      const found = products.map(p => p.id);
      const missing = productIds.filter(id => !found.includes(id));
      throw new ValidationError(`Artikel nicht gefunden: ${missing.join(', ')}`);
    }

    const productMap = new Map(products.map(p => [p.id, p]));

    const computedItems = input.items.map(item => {
      const product = productMap.get(item.productId)!;
      const discount = item.discount ?? 0;
      const totalGross = product.price * item.quantity - discount;
      const vatMultiplier = VAT_NUM[product.vatRate] ?? 20;
      const vatFactor = vatMultiplier / (100 + vatMultiplier);
      const totalVat = Math.round(totalGross * vatFactor);
      const totalNet = totalGross - totalVat;

      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.price,
        vatRate: product.vatRate,
        discount,
        totalNet,
        totalVat,
        totalGross,
      };
    });

    const totals = computedItems.reduce(
      (acc, item) => {
        acc.subtotalNet += item.totalNet;
        acc.totalVat += item.totalVat;
        acc.totalGross += item.totalGross;
        if (item.vatRate === 'VAT_0') acc.vat0 += item.totalVat;
        else if (item.vatRate === 'VAT_10') acc.vat10 += item.totalVat;
        else if (item.vatRate === 'VAT_13') acc.vat13 += item.totalVat;
        else acc.vat20 += item.totalVat;
        return acc;
      },
      { subtotalNet: 0, vat0: 0, vat10: 0, vat13: 0, vat20: 0, totalVat: 0, totalGross: 0 },
    );

    const tip = input.payment.tip ?? 0;
    const amountPaid = input.payment.amountPaid;
    const change = input.payment.method === 'cash' ? Math.max(0, amountPaid - totals.totalGross - tip) : 0;

    const receipt = await prisma.$transaction(async (tx) => {
      const last = await tx.receipt.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { receiptNumber: true },
      });

      const year = new Date().getFullYear();
      let nextNum = 1;
      if (last?.receiptNumber) {
        const parts = last.receiptNumber.split('-');
        const lastNum = parseInt(parts[parts.length - 1] ?? '0', 10);
        const lastYear = parseInt(parts[0] ?? '0', 10);
        nextNum = lastYear === year ? lastNum + 1 : 1;
      }

      const receiptNumber = `${year}-${String(nextNum).padStart(6, '0')}`;

      return tx.receipt.create({
        data: {
          tenantId,
          receiptNumber,
          cashRegisterId: input.cashRegisterId ?? 'KASSE-01',
          type: 'sale',
          status: 'pending',
          cashierId,
          channel: input.channel ?? 'direct',
          externalOrderId: input.externalOrderId ?? null,
          incomingOrderId: input.incomingOrderId ?? null,
          paymentMethod: input.payment.method,
          amountPaid,
          change,
          tip,
          ...totals,
          items: {
            create: computedItems,
          },
        },
        include: { items: true },
      });
    });

    await rksvQueue.add('sign_receipt', {
      receiptId: receipt.id,
      tenantId,
    });

    return toReceiptResponse(receipt);
  }

  async getById(tenantId: string, receiptId: string) {
    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, tenantId },
      include: { items: true },
    });
    if (!receipt) throw new NotFoundError('Bon');
    return toReceiptResponse(receipt);
  }

  async list(tenantId: string, filters: {
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
    channel?: string;
    status?: string;
  } = {}) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenantId };
    if (filters.channel) where['channel'] = filters.channel;
    if (filters.status) where['status'] = filters.status;
    if (filters.from || filters.to) {
      where['createdAt'] = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(`${filters.to}T23:59:59`) }),
      };
    }

    const [items, total] = await prisma.$transaction([
      prisma.receipt.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      prisma.receipt.count({ where }),
    ]);

    return { items: items.map(toReceiptResponse), total, page, pageSize, hasMore: skip + items.length < total };
  }

  /** Storno: neuer Bon mit negativen Beträgen */
  async cancel(tenantId: string, cashierId: string, receiptId: string, reason?: string) {
    const original = await this.getById(tenantId, receiptId);

    if (original.type === 'cancellation') {
      throw new ValidationError('Storno-Bons können nicht nochmals storniert werden');
    }
    if (original.status === 'cancelled') {
      throw new ValidationError('Dieser Bon wurde bereits storniert');
    }

    const cancelReceipt = await prisma.$transaction(async (tx) => {
      await tx.receipt.update({ where: { id: receiptId }, data: { status: 'cancelled' } });

      const last = await tx.receipt.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { receiptNumber: true },
      });

      const year = new Date().getFullYear();
      let nextNum = 1;
      if (last?.receiptNumber) {
        const parts = last.receiptNumber.split('-');
        const lastNum = parseInt(parts[parts.length - 1] ?? '0', 10);
        nextNum = lastNum + 1;
      }
      const receiptNumber = `${year}-${String(nextNum).padStart(6, '0')}`;

      return tx.receipt.create({
        data: {
          tenantId,
          receiptNumber,
          cashRegisterId: original.cashRegisterId,
          type: 'cancellation',
          status: 'pending',
          cashierId,
          channel: original.channel,
          externalOrderId: null,
          paymentMethod: original.payment.method,
          amountPaid: -original.payment.amountPaid,
          change: 0,
          tip: 0,
          subtotalNet: -original.totals.subtotalNet,
          vat0: -original.totals.vat0,
          vat10: -original.totals.vat10,
          vat13: -original.totals.vat13,
          vat20: -original.totals.vat20,
          totalVat: -original.totals.totalVat,
          totalGross: -original.totals.totalGross,
          items: {
            create: original.items.map(item => ({
              productId: item.productId,
              productName: item.productName,
              quantity: -item.quantity,
              unitPrice: item.unitPrice,
              vatRate: toVatEnum(item.vatRate),
              discount: item.discount,
              totalNet: -item.totalNet,
              totalVat: -item.totalVat,
              totalGross: -item.totalGross,
            })),
          },
        },
        include: { items: true },
      });
    });

    await rksvQueue.add('sign_receipt', { receiptId: cancelReceipt.id, tenantId });

    return toReceiptResponse(cancelReceipt as ReceiptWithItems);
  }

  /** Nullbeleg erstellen (RKSV-Test) */
  async createNullReceipt(tenantId: string, cashierId: string) {
    return this._createZeroReceipt(tenantId, cashierId, 'null_receipt');
  }

  /** Trainingsbeleg erstellen (Schulungsmodus) */
  async createTrainingReceipt(tenantId: string, cashierId: string) {
    return this._createZeroReceipt(tenantId, cashierId, 'training');
  }

  /** Schlussbeleg erstellen (Kasse außer Betrieb) */
  async createClosingReceipt(tenantId: string, cashierId: string, cashRegisterId?: string) {
    return this._createZeroReceipt(tenantId, cashierId, 'closing_receipt', cashRegisterId ?? 'KASSE-01');
  }

  /** Erstellt einen Null-Beleg (0 EUR) für verschiedene Sonder-Typen */
  private async _createZeroReceipt(
    tenantId: string,
    cashierId: string,
    type: 'null_receipt' | 'training' | 'closing_receipt',
    cashRegisterId = 'KASSE-01',
  ) {
    const year = new Date().getFullYear();
    const last = await prisma.receipt.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { receiptNumber: true },
    });
    let nextNum = 1;
    if (last?.receiptNumber) {
      const parts = last.receiptNumber.split('-');
      nextNum = parseInt(parts[parts.length - 1] ?? '0', 10) + 1;
    }

    const receipt = await prisma.receipt.create({
      data: {
        tenantId,
        receiptNumber: `${year}-${String(nextNum).padStart(6, '0')}`,
        cashRegisterId,
        type,
        status: 'pending',
        cashierId,
        channel: 'direct',
        paymentMethod: 'cash',
        amountPaid: 0, change: 0, tip: 0,
        subtotalNet: 0, vat0: 0, vat10: 0, vat13: 0, vat20: 0, totalVat: 0, totalGross: 0,
      },
      include: { items: true },
    });

    await rksvQueue.add('sign_receipt', { receiptId: receipt.id, tenantId });
    return toReceiptResponse(receipt);
  }
}
