import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/crypto';
import { NotFoundError, ValidationError, AppError } from '../../lib/errors';
import type { FastifyInstance } from 'fastify';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InitiatePaymentParams {
  amount: number;       // cents
  currency: string;     // 'EUR'
  receiptId: string;
  orderId: string;
  terminalSerialNumber?: string;
}

export interface PaymentStatusResult {
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  authCode?: string;
  cardBrand?: string;
  last4?: string;
}

export interface MyPOSWebhookPayload {
  transaction_id?: string;
  transactionId?: string;
  order_id?: string;
  orderId?: string;
  status?: string;
  payment_status?: string;
  auth_code?: string;
  card_brand?: string;
  last_four?: string;
  amount?: string;
  currency?: string;
  store_id?: string;
  signature?: string;
  [key: string]: string | undefined;
}

const MYPOS_API_BASE = 'https://mypos.com/api/v1.4';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map raw myPOS status strings to our canonical status */
function mapStatus(raw: string | undefined): PaymentStatusResult['status'] {
  if (!raw) return 'pending';
  const s = raw.toLowerCase();
  if (s === 'approved' || s === 'success' || s === 'completed') return 'approved';
  if (s === 'declined' || s === 'failed' || s === 'rejected') return 'declined';
  if (s === 'cancelled' || s === 'canceled' || s === 'voided') return 'cancelled';
  return 'pending';
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MyPOSService {
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /**
   * Retrieve and decrypt myPOS credentials for a tenant.
   * Throws NotFoundError if the tenant is missing or credentials are not configured.
   */
  private async getCredentials(tenantId: string): Promise<{
    storeId: string;
    apiKey: string;
    secretKey: string;
    terminalSerial: string | null;
  }> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant');

    if (!tenant.myposStoreId || !tenant.myposApiKey_encrypted || !tenant.myposSecretKey_encrypted) {
      throw new ValidationError('myPOS ist nicht konfiguriert. Bitte tragen Sie Store-ID, API-Key und Secret-Key in den Einstellungen ein.');
    }

    return {
      storeId: tenant.myposStoreId,
      apiKey: decrypt(tenant.myposApiKey_encrypted),
      secretKey: decrypt(tenant.myposSecretKey_encrypted),
      terminalSerial: tenant.myposTerminalSerial ?? null,
    };
  }

  /**
   * Build the Basic Auth header value for myPOS: base64(store_id:api_key)
   */
  private basicAuthHeader(storeId: string, apiKey: string): string {
    return 'Basic ' + Buffer.from(`${storeId}:${apiKey}`).toString('base64');
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Initiate a card payment on the myPOS terminal.
   * Calls POST /transaction on the myPOS Cloud API.
   */
  async initiatePayment(
    tenantId: string,
    params: InitiatePaymentParams,
  ): Promise<{ transactionId: string; status: 'pending' }> {
    const creds = await this.getCredentials(tenantId);

    const amountEur = (params.amount / 100).toFixed(2);
    const callbackUrl = `${process.env['API_BASE_URL'] ?? 'https://api.kassomat.at'}/webhooks/mypos`;

    const body: Record<string, string> = {
      store_id: creds.storeId,
      amount: amountEur,
      currency: params.currency ?? 'EUR',
      order_id: params.orderId,
      description: `Bon ${params.receiptId}`,
      callback_url: callbackUrl,
    };

    // Include terminal serial if provided or configured
    const terminal = params.terminalSerialNumber ?? creds.terminalSerial;
    if (terminal) {
      body['terminal_serial_number'] = terminal;
    }

    const response = await fetch(`${MYPOS_API_BASE}/transaction`, {
      method: 'POST',
      headers: {
        Authorization: this.basicAuthHeader(creds.storeId, creds.apiKey),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.fastify.log.error(
        { status: response.status, body: text, tenantId, orderId: params.orderId },
        '[myPOS] initiatePayment failed',
      );
      throw new AppError(
        502,
        'MYPOS_ERROR',
        `myPOS Zahlung konnte nicht gestartet werden (HTTP ${response.status})`,
      );
    }

    const json = await response.json() as Record<string, unknown>;
    const transactionId = (json['transaction_id'] ?? json['transactionId']) as string | undefined;

    if (!transactionId) {
      this.fastify.log.error({ response: json, tenantId }, '[myPOS] No transaction_id in response');
      throw new AppError(502, 'MYPOS_ERROR', 'myPOS hat keine Transaktions-ID zurückgegeben');
    }

    this.fastify.log.info(
      { transactionId, orderId: params.orderId, tenantId },
      '[myPOS] Payment initiated',
    );

    return { transactionId, status: 'pending' };
  }

  /**
   * Poll the status of an existing transaction from myPOS.
   * Calls GET /transaction/{transaction_id}.
   */
  async getPaymentStatus(
    tenantId: string,
    transactionId: string,
  ): Promise<PaymentStatusResult> {
    const creds = await this.getCredentials(tenantId);

    const response = await fetch(`${MYPOS_API_BASE}/transaction/${encodeURIComponent(transactionId)}`, {
      method: 'GET',
      headers: {
        Authorization: this.basicAuthHeader(creds.storeId, creds.apiKey),
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.fastify.log.error(
        { status: response.status, body: text, tenantId, transactionId },
        '[myPOS] getPaymentStatus failed',
      );
      throw new AppError(
        502,
        'MYPOS_ERROR',
        `myPOS Status-Abfrage fehlgeschlagen (HTTP ${response.status})`,
      );
    }

    const json = await response.json() as Record<string, unknown>;

    return {
      status: mapStatus((json['status'] ?? json['payment_status']) as string | undefined),
      authCode: (json['auth_code'] as string | undefined) ?? undefined,
      cardBrand: (json['card_brand'] as string | undefined) ?? undefined,
      last4: (json['last_four'] ?? json['last4']) as string | undefined ?? undefined,
    };
  }

  /**
   * Process an IPN (Instant Payment Notification) webhook from myPOS.
   *
   * Steps:
   * 1. Extract the tenant from the store_id on the payload.
   * 2. Verify the HMAC-SHA256 signature.
   * 3. On approved: update the receipt status and emit payment:confirmed via Socket.io.
   * 4. On declined: emit payment:declined via Socket.io.
   */
  async processWebhook(payload: MyPOSWebhookPayload): Promise<void> {
    const storeId = payload['store_id'];
    if (!storeId) {
      this.fastify.log.warn('[myPOS] Webhook missing store_id');
      return;
    }

    // Find the tenant by storeId
    const tenant = await prisma.tenant.findFirst({
      where: { myposStoreId: storeId },
    });
    if (!tenant) {
      this.fastify.log.warn({ storeId }, '[myPOS] Webhook: tenant not found for store_id');
      return;
    }

    if (!tenant.myposSecretKey_encrypted) {
      this.fastify.log.warn({ storeId }, '[myPOS] Webhook: no secret key configured for tenant');
      return;
    }

    const secretKey = decrypt(tenant.myposSecretKey_encrypted);
    const signature = payload['signature'];

    if (!signature || !this.verifySignature(payload, signature, secretKey)) {
      this.fastify.log.warn(
        { tenantId: tenant.id, storeId },
        '[myPOS] Webhook signature verification failed',
      );
      return;
    }

    const transactionId = (payload['transaction_id'] ?? payload['transactionId']) as string | undefined;
    const orderId = (payload['order_id'] ?? payload['orderId']) as string | undefined;
    const rawStatus = (payload['status'] ?? payload['payment_status']) as string | undefined;
    const status = mapStatus(rawStatus);

    this.fastify.log.info(
      { tenantId: tenant.id, transactionId, orderId, status },
      '[myPOS] Webhook received',
    );

    // Resolve the receiptId from the orderId stored in the receipt
    // The orderId we sent was the receiptId itself (set in initiatePayment description / order_id)
    let receiptId: string | undefined = orderId;

    if (status === 'approved') {
      // Update receipt status to 'signed' (or at minimum mark payment as confirmed)
      if (receiptId) {
        try {
          await prisma.receipt.updateMany({
            where: { id: receiptId, tenantId: tenant.id },
            data: { status: 'signed' },
          });
        } catch (err) {
          this.fastify.log.error(
            { err, receiptId, tenantId: tenant.id },
            '[myPOS] Failed to update receipt status after payment:approved',
          );
        }
      }

      this.fastify.realtime.emitToTenant(tenant.id, 'payment:confirmed', {
        receiptId,
        transactionId,
        amount: payload['amount'],
      });

      this.fastify.log.info(
        { tenantId: tenant.id, transactionId, receiptId },
        '[myPOS] payment:confirmed emitted',
      );
    } else if (status === 'declined' || status === 'cancelled') {
      this.fastify.realtime.emitToTenant(tenant.id, 'payment:declined', {
        receiptId,
        transactionId,
        amount: payload['amount'],
      });

      this.fastify.log.info(
        { tenantId: tenant.id, transactionId, receiptId },
        '[myPOS] payment:declined emitted',
      );
    }
  }

  /**
   * Verify a myPOS IPN signature.
   *
   * myPOS signs the payload using HMAC-SHA256 of a string built from
   * all non-signature parameters sorted alphabetically by key and
   * concatenated as key=value pairs, then HMAC'd with the secret key.
   */
  verifySignature(
    params: Record<string, string | undefined>,
    signature: string,
    secretKey: string,
  ): boolean {
    // Build sorted param string, excluding the signature field itself
    const sorted = Object.entries(params)
      .filter(([key, value]) => key !== 'signature' && value !== undefined && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value as string}`)
      .join('&');

    const expected = createHmac('sha256', secretKey)
      .update(sorted, 'utf8')
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      const expectedBuf = Buffer.from(expected, 'hex');
      const signatureBuf = Buffer.from(signature, 'hex');
      if (expectedBuf.length !== signatureBuf.length) return false;
      return timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
      return false;
    }
  }
}
