import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../../lib/prisma';
import { AppError, NotFoundError } from '../../lib/errors';
import type { IncomingOrder } from '@kassomat/types';

// ---------------------------------------------------------------------------
// Wix Automations Webhook Payload — actual format sent by Wix
// ---------------------------------------------------------------------------

interface WixMoneyAmount {
  value: string;   // e.g. "23.98"
  currency: string;
}

interface WixLineItem {
  id: string;
  itemName?: string;      // Wix Automations field
  name?: string;          // fallback
  quantity: number;
  totalPrice?: WixMoneyAmount;          // total incl. tax for this line
  totalPriceBeforeTax?: WixMoneyAmount; // total excl. tax for this line
  price?: string | WixMoneyAmount;      // legacy / alternative
}

interface WixContactDetails {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

interface WixAddress {
  addressLine?: string;
  city?: string;
  postalCode?: string;
  zipCode?: string;       // legacy field name
}

interface WixWebhookPayload {
  data: {
    // Wix Automations uses "id", legacy webhooks use "orderId"
    id?: string;
    orderId?: string;

    lineItems: WixLineItem[];

    // Wix Automations: buyer contact in billingInfo or shippingDestination
    buyerInfo?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
    };
    buyerEmail?: string;

    billingInfo?: {
      contactDetails?: WixContactDetails;
      address?: WixAddress;
    };

    shippingInfo?: {
      // Wix Automations nested format
      logistics?: {
        shippingDestination?: {
          address?: WixAddress;
          contactDetails?: WixContactDetails;
        };
      };
      // Legacy flat format
      shipmentDetails?: {
        address?: WixAddress;
      };
    };

    paymentStatus?: string;
    priceSummary?: {
      total?: WixMoneyAmount;
    };
    note?: string;
    buyerNote?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priceToCents(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  const parsed = parseFloat(String(value).replace(',', '.'));
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WixService {
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf8');
      const receivedBuf = Buffer.from(signature, 'utf8');
      if (expectedBuf.length !== receivedBuf.length) return false;
      return timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      return false;
    }
  }

  async receiveOrder(
    tenantId: string,
    webhookPayload: unknown,
    signature: string,
  ): Promise<IncomingOrder> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, wixIsActive: true, wixWebhookSecret: true },
    });

    if (!tenant) throw new NotFoundError('Tenant');
    if (!tenant.wixIsActive) {
      throw new AppError(403, 'INTEGRATION_DISABLED', 'Wix integration is not active for this tenant');
    }

    if (tenant.wixWebhookSecret && signature) {
      const rawPayload = typeof webhookPayload === 'string'
        ? webhookPayload
        : JSON.stringify(webhookPayload);
      if (!this.verifyWebhookSignature(rawPayload, signature, tenant.wixWebhookSecret)) {
        throw new AppError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
      }
    }

    const wix = webhookPayload as WixWebhookPayload;
    const data = wix?.data;

    // Support both "id" (Wix Automations) and "orderId" (legacy)
    const orderId = data?.id ?? data?.orderId;
    if (!orderId) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Missing order id in webhook payload');
    }

    // ---- Payment status ----
    const paymentMethod: 'cash_on_delivery' | 'online_paid' =
      data.paymentStatus === 'PAID' ? 'online_paid' : 'cash_on_delivery';

    // ---- Contact details — prefer shippingDestination, fall back to billingInfo ----
    const shippingContact = data.shippingInfo?.logistics?.shippingDestination?.contactDetails;
    const billingContact = data.billingInfo?.contactDetails;
    const legacyBuyer = data.buyerInfo;

    const firstName = shippingContact?.firstName ?? billingContact?.firstName ?? legacyBuyer?.firstName;
    const lastName  = shippingContact?.lastName  ?? billingContact?.lastName  ?? legacyBuyer?.lastName;
    const phone     = shippingContact?.phone     ?? billingContact?.phone     ?? legacyBuyer?.phone;
    const email     = data.buyerEmail ?? legacyBuyer?.email ?? null;

    const nameParts = [firstName, lastName].filter(Boolean);
    const customerName = nameParts.length > 0 ? nameParts.join(' ') : null;

    // ---- Delivery address ----
    const shippingAddr = data.shippingInfo?.logistics?.shippingDestination?.address
      ?? data.shippingInfo?.shipmentDetails?.address;

    const deliveryStreet = shippingAddr?.addressLine ?? null;
    const deliveryCity   = shippingAddr?.city ?? null;
    const deliveryZip    = shippingAddr?.postalCode ?? shippingAddr?.zipCode ?? null;

    // ---- Total amount ----
    // Prefer priceSummary.total if available, otherwise sum line items
    let totalAmount: number;
    if (data.priceSummary?.total?.value) {
      totalAmount = priceToCents(data.priceSummary.total.value);
    } else {
      totalAmount = (data.lineItems ?? []).reduce((sum, item) => {
        const lineTotal = item.totalPrice?.value ?? item.totalPriceBeforeTax?.value;
        return sum + priceToCents(lineTotal);
      }, 0);
    }

    // ---- Line items ----
    const lineItems = (data.lineItems ?? []).map((item) => {
      const name = item.itemName ?? item.name ?? 'Artikel';
      const lineTotalCents = priceToCents(item.totalPrice?.value ?? item.totalPriceBeforeTax?.value ?? item.price as string);
      const unitPriceCents = item.quantity > 0 ? Math.round(lineTotalCents / item.quantity) : lineTotalCents;
      return {
        externalId: item.id ?? crypto.randomUUID(),
        name,
        quantity: item.quantity,
        unitPrice: unitPriceCents,
        totalPrice: lineTotalCents,
        options: [] as string[],
      };
    });

    const saved = await prisma.incomingOrder.upsert({
      where: { tenantId_externalId: { tenantId, externalId: orderId } },
      create: {
        tenantId,
        source: 'wix',
        externalId: orderId,
        status: 'pending',
        customerName,
        customerPhone: phone ?? null,
        customerEmail: email,
        deliveryStreet,
        deliveryCity,
        deliveryZip,
        paymentMethod,
        totalAmount,
        notes: data.buyerNote ?? data.note ?? null,
        rawPayload: webhookPayload as never,
        items: { create: lineItems },
      },
      update: { rawPayload: webhookPayload as never },
      include: { items: true },
    });

    const result: any = {
      ...saved,
      customer: (saved as any).customerName ? {
        name: (saved as any).customerName,
        phone: (saved as any).customerPhone ?? null,
        email: (saved as any).customerEmail ?? null,
      } : null,
      deliveryAddress: (saved as any).deliveryStreet ? {
        street: (saved as any).deliveryStreet,
        city: (saved as any).deliveryCity ?? '',
        zip: (saved as any).deliveryZip ?? '',
        notes: null,
      } : null,
    };
    return result as unknown as IncomingOrder;
  }
}
