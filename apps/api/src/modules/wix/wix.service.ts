import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../../lib/prisma';
import { AppError, NotFoundError } from '../../lib/errors';
import type { IncomingOrder } from '@kassomat/types';

// ---------------------------------------------------------------------------
// Wix eCommerce Webhook Payload shape
// ---------------------------------------------------------------------------

interface WixLineItem {
  id: string;
  name: string;
  quantity: number;
  price: string; // e.g. "9.90"
}

interface WixWebhookPayload {
  data: {
    orderId: string;
    lineItems: WixLineItem[];
    buyerInfo: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
    };
    shippingInfo?: {
      shipmentDetails?: {
        address?: {
          addressLine?: string;
          city?: string;
          zipCode?: string;
        };
      };
    };
    paymentStatus: string; // "PAID" | "PENDING" | ...
    note?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a price string like "9.90" to integer cents (990).
 * Multiplies by 100 and rounds to the nearest integer.
 */
function priceToCents(priceStr: string): number {
  const parsed = parseFloat(priceStr);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WixService {
  /**
   * Verify HMAC-SHA256 webhook signature.
   * Wix sends the signature in a dedicated header (e.g. X-Wix-Signature) as a
   * hex-encoded HMAC-SHA256 of the raw request body.
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      const expected = createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      const expectedBuf = Buffer.from(expected, 'utf8');
      const receivedBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== receivedBuf.length) return false;
      return timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      return false;
    }
  }

  /**
   * Parse a Wix eCommerce webhook payload and persist the order.
   * Returns the saved IncomingOrder.
   */
  async receiveOrder(
    tenantId: string,
    webhookPayload: unknown,
    signature: string,
  ): Promise<IncomingOrder> {
    // Load tenant config
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        wixIsActive: true,
        wixWebhookSecret: true,
      },
    });

    if (!tenant) throw new NotFoundError('Tenant');

    if (!tenant.wixIsActive) {
      throw new AppError(403, 'INTEGRATION_DISABLED', 'Wix integration is not active for this tenant');
    }

    // Only verify signature when a secret is configured (skip for Wix Automations)
    if (tenant.wixWebhookSecret && signature) {
      const rawPayload = typeof webhookPayload === 'string'
        ? webhookPayload
        : JSON.stringify(webhookPayload);

      if (!this.verifyWebhookSignature(rawPayload, signature, tenant.wixWebhookSecret)) {
        throw new AppError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
      }
    }

    // Parse and validate payload shape
    const wix = webhookPayload as WixWebhookPayload;

    if (!wix?.data?.orderId) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Missing data.orderId in webhook payload');
    }

    const data = wix.data;

    // Map payment status
    const paymentMethod: 'cash_on_delivery' | 'online_paid' =
      data.paymentStatus === 'PAID' ? 'online_paid' : 'cash_on_delivery';

    // Build customer name from buyer info
    const nameParts = [data.buyerInfo.firstName, data.buyerInfo.lastName].filter(Boolean);
    const customerName = nameParts.length > 0 ? nameParts.join(' ') : null;

    // Shipping address shorthand
    const address = data.shippingInfo?.shipmentDetails?.address;

    // Calculate total amount from line items (sum of unitPrice × quantity in cents)
    const totalAmount = data.lineItems.reduce((sum, item) => {
      return sum + priceToCents(item.price) * item.quantity;
    }, 0);

    // Persist order — upsert to handle duplicate webhook deliveries
    const saved = await prisma.incomingOrder.upsert({
      where: {
        tenantId_externalId: {
          tenantId,
          externalId: data.orderId,
        },
      },
      create: {
        tenantId,
        source: 'wix',
        externalId: data.orderId,
        status: 'pending',
        customerName,
        customerPhone: data.buyerInfo.phone ?? null,
        customerEmail: data.buyerInfo.email ?? null,
        deliveryStreet: address?.addressLine ?? null,
        deliveryCity: address?.city ?? null,
        deliveryZip: address?.zipCode ?? null,
        paymentMethod,
        totalAmount,
        notes: data.note ?? null,
        rawPayload: webhookPayload as never,
        items: {
          create: data.lineItems.map((item) => ({
            externalId: item.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: priceToCents(item.price),
            totalPrice: priceToCents(item.price) * item.quantity,
            options: [],
          })),
        },
      },
      update: {
        // Idempotent — only update raw payload on duplicate delivery
        rawPayload: webhookPayload as never,
      },
      include: { items: true },
    });

    return saved as unknown as IncomingOrder;
  }
}
