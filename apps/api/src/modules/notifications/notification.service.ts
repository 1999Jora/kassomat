import { prisma } from '../../lib/prisma';

// Cast prisma to access deviceToken model — type becomes available after `prisma generate`
const db = prisma as any;

// ---------------------------------------------------------------------------
// Firebase Admin — lazy-initialized singleton
//
// Uses FIREBASE_SERVICE_ACCOUNT env var (JSON string).
// If not set, all send operations are graceful no-ops.
// ---------------------------------------------------------------------------

let firebaseApp: any = null;
let firebaseMessaging: any = null;
let firebaseInitialized = false;
let firebaseAvailable = false;

async function ensureFirebase(): Promise<boolean> {
  if (firebaseInitialized) return firebaseAvailable;
  firebaseInitialized = true;

  const serviceAccountJson = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (!serviceAccountJson) {
    console.warn('[Notifications] FIREBASE_SERVICE_ACCOUNT nicht gesetzt — Push-Benachrichtigungen deaktiviert');
    return false;
  }

  try {
    // Dynamic import so the app works without firebase-admin installed.
    // Using Function constructor to avoid TypeScript module resolution errors.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const loadModule = new Function('moduleName', 'return import(moduleName)') as (m: string) => Promise<any>;
    const admin = await loadModule('firebase-admin');
    const serviceAccount = JSON.parse(serviceAccountJson);

    const adminDefault = admin.default ?? admin;
    firebaseApp = adminDefault.initializeApp({
      credential: adminDefault.credential.cert(serviceAccount),
    });
    firebaseMessaging = adminDefault.messaging();
    firebaseAvailable = true;
    console.log('[Notifications] Firebase Admin SDK initialisiert');
    return true;
  } catch (err) {
    console.error('[Notifications] Firebase-Initialisierung fehlgeschlagen:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Source label map for notification body
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  lieferando: 'Lieferando',
  wix: 'Wix',
  mergeport: 'Mergeport',
};

// ---------------------------------------------------------------------------
// Notification Service (singleton)
// ---------------------------------------------------------------------------

class NotificationServiceImpl {
  /**
   * Register an FCM device token for a user/tenant.
   * Upserts — if the token already exists, updates the association.
   */
  async registerDevice(
    userId: string,
    tenantId: string,
    token: string,
    platform: string,
  ): Promise<void> {
    await db.deviceToken.upsert({
      where: { token },
      create: { userId, tenantId, token, platform },
      update: { userId, tenantId, platform, updatedAt: new Date() },
    });
  }

  /**
   * Unregister an FCM device token.
   */
  async unregisterDevice(token: string): Promise<void> {
    await db.deviceToken.deleteMany({ where: { token } });
  }

  /**
   * Send a push notification to all registered devices of a tenant
   * when a new order arrives.
   *
   * Gracefully skips if Firebase is not configured.
   */
  async sendOrderNotification(
    tenantId: string,
    order: {
      id?: string;
      externalId?: string;
      orderNumber?: number;
      source?: string;
      totalAmount?: number;
    },
  ): Promise<void> {
    const ready = await ensureFirebase();
    if (!ready) return;

    // Get all device tokens for this tenant
    const devices = await db.deviceToken.findMany({
      where: { tenantId },
      select: { token: true },
    });

    if (devices.length === 0) return;

    const sourceLabel = SOURCE_LABELS[order.source ?? ''] ?? order.source ?? 'Unbekannt';
    const orderLabel = order.orderNumber
      ? `#${order.orderNumber}`
      : order.externalId
        ? `#${order.externalId.slice(0, 8)}`
        : '';

    const title = 'Neue Bestellung';
    const body = `Bestellung ${orderLabel} von ${sourceLabel}`;

    const tokens = devices.map((d: { token: string }) => d.token);

    try {
      const response = await firebaseMessaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: {
          type: 'new_order',
          orderId: order.id ?? '',
          channel: order.source ?? '',
        },
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'orders',
            sound: 'default',
            priority: 'high' as const,
          },
        },
      });

      // Clean up invalid tokens
      if (response.responses) {
        const invalidTokens: string[] = [];
        for (let i = 0; i < response.responses.length; i++) {
          const resp = response.responses[i];
          if (
            resp?.error &&
            (resp.error.code === 'messaging/registration-token-not-registered' ||
              resp.error.code === 'messaging/invalid-registration-token')
          ) {
            invalidTokens.push(tokens[i]!);
          }
        }
        if (invalidTokens.length > 0) {
          await db.deviceToken.deleteMany({
            where: { token: { in: invalidTokens } },
          });
          console.log(`[Notifications] ${invalidTokens.length} ungültige Token entfernt`);
        }
      }

      const successCount = response.successCount ?? 0;
      const failureCount = response.failureCount ?? 0;
      if (failureCount > 0) {
        console.warn(
          `[Notifications] Push gesendet: ${successCount} OK, ${failureCount} fehlgeschlagen (Tenant: ${tenantId})`,
        );
      }
    } catch (err) {
      console.error('[Notifications] Fehler beim Senden der Push-Benachrichtigung:', err);
    }
  }
}

// Singleton export
export const notificationService = new NotificationServiceImpl();
