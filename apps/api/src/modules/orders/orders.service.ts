import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { ReceiptsService } from '../receipts/receipts.service';
import type { PaymentMethod } from '@kassomat/types';

function toIncomingOrder(p: any): any {
  return {
    ...p,
    customer: p.customerName ? {
      name: p.customerName,
      phone: p.customerPhone ?? null,
      email: p.customerEmail ?? null,
    } : null,
    deliveryAddress: p.deliveryStreet ? {
      street: p.deliveryStreet,
      city: p.deliveryCity ?? '',
      zip: p.deliveryZip ?? '',
      notes: p.deliveryNotes ?? null,
    } : null,
  };
}

export class OrdersService {
  private receiptsService = new ReceiptsService();

  async list(tenantId: string, filters: {
    status?: string;
    source?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenantId };
    if (filters.status) where['status'] = filters.status;
    if (filters.source) where['source'] = filters.source;

    const [items, total] = await prisma.$transaction([
      prisma.incomingOrder.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { receivedAt: 'desc' },
        include: { items: true },
      }),
      prisma.incomingOrder.count({ where }),
    ]);

    return { items: items.map(toIncomingOrder), total, page, pageSize, hasMore: skip + items.length < total };
  }

  async updateStatus(
    tenantId: string,
    orderId: string,
    status: string,
    _reason?: string,
  ) {
    const order = await this.findOwned(tenantId, orderId);

    return prisma.incomingOrder.update({
      where: { id: order.id },
      data: { status: status as never },
      include: { items: true },
    });
  }

  /** Order → Bon konvertieren */
  async createReceiptFromOrder(
    tenantId: string,
    cashierId: string,
    orderId: string,
    payment: { method: PaymentMethod; amountPaid: number; tip?: number },
  ) {
    const order = await this.findOwned(tenantId, orderId);

    if (order.receipts.length > 0 && order.receipts[0]) {
      // Bereits existierenden Bon zurückgeben statt Fehler
      return this.receiptsService.getById(tenantId, order.receipts[0].id);
    }

    // Online-bezahlte Bestellungen: Bon ohne RKSV (§ 131b BAO)
    const channel = order.source === 'lieferando' ? 'lieferando' : 'wix';
    const paymentMethod = order.paymentMethod === 'online_paid' ? 'online' : payment.method;

    // Artikel-Mapping: externe ID → lokales Produkt
    const receiptItems = await Promise.all(
      order.items.map(async (item) => {
        const product = await prisma.product.findFirst({
          where: {
            tenantId,
            deletedAt: null,
            OR: [
              { lieferandoExternalId: item.externalId },
              { wixProductId: item.externalId },
              { name: { equals: item.name, mode: 'insensitive' } },
            ],
          },
        });

        if (!product) {
          // Fallback: Produkt on-the-fly erstellen (erfordert Default-Kategorie)
          const defaultCat = await prisma.category.findFirst({ where: { tenantId } });
          if (!defaultCat) throw new ValidationError(`Artikel "${item.name}" nicht gefunden und keine Kategorie vorhanden`);

          const created = await prisma.product.create({
            data: {
              tenantId,
              name: item.name,
              price: item.unitPrice,
              vatRate: 'VAT_20',
              categoryId: defaultCat.id,
              lieferandoExternalId: order.source === 'lieferando' ? item.externalId : null,
              wixProductId: order.source === 'wix' ? item.externalId : null,
            },
          });
          return { productId: created.id, quantity: item.quantity };
        }

        return { productId: product.id, quantity: item.quantity };
      }),
    );

    const receipt = await this.receiptsService.create(tenantId, cashierId, {
      channel,
      externalOrderId: order.externalId,
      incomingOrderId: order.id,
      items: receiptItems,
      payment: { method: paymentMethod, amountPaid: payment.amountPaid, tip: payment.tip },
    });

    // Order als "in_progress" markieren
    await prisma.incomingOrder.update({
      where: { id: order.id },
      data: { status: 'in_progress' },
    });

    return receipt;
  }

  private async findOwned(tenantId: string, orderId: string) {
    const order = await prisma.incomingOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true, receipts: { select: { id: true } } },
    });
    if (!order) throw new NotFoundError('Bestellung');
    return order;
  }
}
