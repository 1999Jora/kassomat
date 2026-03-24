import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/crypto';
import { AppError, NotFoundError } from '../../lib/errors';
import type { IncomingOrder } from '@kassomat/types';

// ---------------------------------------------------------------------------
// JET Webhook Payload shape
// ---------------------------------------------------------------------------

interface JetOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: { amount: number };
  totalPrice: { amount: number };
}

interface JetWebhookPayload {
  type: string;
  order: {
    id: string;
    items: JetOrderItem[];
    customer: {
      name: string;
      phone?: string;
    };
    deliveryAddress?: {
      street?: string;
      city?: string;
      postalCode?: string;
    };
    payment: {
      type: string;
    };
    totalAmount: { amount: number };
    notes?: string;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LieferandoService {
  /**
   * Verify HMAC-SHA256 webhook signature.
   * The JET platform sends the signature in the X-JET-Signature header as a
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
   * Parse a JET POS API webhook payload and persist the order.
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
        lieferandoIsActive: true,
        lieferandoWebhookSecret: true,
      },
    });

    if (!tenant) throw new NotFoundError('Tenant');

    if (!tenant.lieferandoIsActive) {
      throw new AppError(403, 'INTEGRATION_DISABLED', 'Lieferando integration is not active for this tenant');
    }

    if (!tenant.lieferandoWebhookSecret) {
      throw new AppError(500, 'CONFIGURATION_ERROR', 'Lieferando webhook secret is not configured');
    }

    // Serialize payload for signature verification
    const rawPayload = typeof webhookPayload === 'string'
      ? webhookPayload
      : JSON.stringify(webhookPayload);

    if (!this.verifyWebhookSignature(rawPayload, signature, tenant.lieferandoWebhookSecret)) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
    }

    // Parse and validate payload shape
    const jet = webhookPayload as JetWebhookPayload;

    if (!jet?.order?.id) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Missing order.id in webhook payload');
    }

    const order = jet.order;

    // Map payment method
    const paymentMethod: 'cash_on_delivery' | 'online_paid' =
      order.payment.type === 'CASH' ? 'cash_on_delivery' : 'online_paid';

    // Persist order — upsert to handle duplicate webhook deliveries
    const saved = await prisma.incomingOrder.upsert({
      where: {
        tenantId_externalId: {
          tenantId,
          externalId: order.id,
        },
      },
      create: {
        tenantId,
        source: 'lieferando',
        externalId: order.id,
        status: 'pending',
        customerName: order.customer.name ?? null,
        customerPhone: order.customer.phone ?? null,
        deliveryStreet: order.deliveryAddress?.street ?? null,
        deliveryCity: order.deliveryAddress?.city ?? null,
        deliveryZip: order.deliveryAddress?.postalCode ?? null,
        paymentMethod,
        totalAmount: order.totalAmount.amount,
        notes: order.notes ?? null,
        rawPayload: webhookPayload as never,
        items: {
          create: order.items.map((item) => ({
            externalId: item.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice.amount,
            totalPrice: item.totalPrice.amount,
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

  /**
   * Accept a Lieferando order via the JET REST API.
   */
  async acceptOrder(tenantId: string, externalOrderId: string): Promise<void> {
    const apiKey = await this.getDecryptedApiKey(tenantId);
    const restaurantId = await this.getRestaurantId(tenantId);

    const url = `https://pos.lieferando.at/api/v1/restaurants/${restaurantId}/orders/${externalOrderId}/accept`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AppError(
        502,
        'LIEFERANDO_API_ERROR',
        `Failed to accept order ${externalOrderId}: ${response.status} ${body}`,
      );
    }

    // Update local status
    await prisma.incomingOrder.updateMany({
      where: { tenantId, externalId: externalOrderId },
      data: { status: 'accepted' },
    });
  }

  /**
   * Reject a Lieferando order via the JET REST API.
   */
  async rejectOrder(
    tenantId: string,
    externalOrderId: string,
    reason: string,
  ): Promise<void> {
    const apiKey = await this.getDecryptedApiKey(tenantId);
    const restaurantId = await this.getRestaurantId(tenantId);

    const url = `https://pos.lieferando.at/api/v1/restaurants/${restaurantId}/orders/${externalOrderId}/reject`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AppError(
        502,
        'LIEFERANDO_API_ERROR',
        `Failed to reject order ${externalOrderId}: ${response.status} ${body}`,
      );
    }

    // Update local status
    await prisma.incomingOrder.updateMany({
      where: { tenantId, externalId: externalOrderId },
      data: { status: 'cancelled' },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getDecryptedApiKey(tenantId: string): Promise<string> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { lieferandoApiKey_encrypted: true },
    });
    if (!tenant?.lieferandoApiKey_encrypted) {
      throw new AppError(500, 'CONFIGURATION_ERROR', 'Lieferando API key is not configured');
    }
    return decrypt(tenant.lieferandoApiKey_encrypted);
  }

  private async getRestaurantId(tenantId: string): Promise<string> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { lieferandoRestaurantId: true },
    });
    if (!tenant?.lieferandoRestaurantId) {
      throw new AppError(500, 'CONFIGURATION_ERROR', 'Lieferando restaurant ID is not configured');
    }
    return tenant.lieferandoRestaurantId;
  }
}
