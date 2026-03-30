// ---------------------------------------------------------------------------
// Push Notifications — Capacitor / FCM integration
//
// Registers for push notifications on native (Android/iOS) platforms.
// Sends the FCM token to the backend for server-side push delivery.
// Graceful no-op in browser environments.
// ---------------------------------------------------------------------------

// Dynamic import helper that avoids TypeScript module resolution errors
// when @capacitor/push-notifications is not yet installed.
// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
const loadModule = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

/**
 * Initialize push notification registration.
 * - On native: registers with FCM, sends token to backend, handles taps.
 * - In browser: silent no-op.
 *
 * Call this once on app startup after initNative().
 */
export async function initPushNotifications(): Promise<void> {
  // Only run on native Capacitor platforms
  let Capacitor: { isNativePlatform: () => boolean; getPlatform: () => string };
  try {
    const core = await import('@capacitor/core');
    Capacitor = core.Capacitor;
  } catch {
    return; // @capacitor/core not available — browser build
  }

  if (!Capacitor.isNativePlatform()) return;

  let PushNotifications: any;
  try {
    const mod = await loadModule('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  } catch {
    console.warn('[Push] @capacitor/push-notifications nicht verfügbar');
    return;
  }

  // Request permission
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== 'granted') {
    console.log('[Push] Benachrichtigungsberechtigung nicht erteilt');
    return;
  }

  // Register for push
  await PushNotifications.register();

  // Listen for registration success — send token to backend
  PushNotifications.addListener('registration', (registrationToken: { value: string }) => {
    console.log('[Push] FCM Token erhalten:', registrationToken.value.slice(0, 20) + '...');
    void sendTokenToBackend(registrationToken.value, Capacitor.getPlatform());
  });

  // Listen for registration errors
  PushNotifications.addListener('registrationError', (error: any) => {
    console.error('[Push] Registrierung fehlgeschlagen:', error);
  });

  // Handle notification tap — navigate to dispatcher page
  PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: { notification: { data: Record<string, string> } }) => {
      console.log('[Push] Benachrichtigung getippt:', action.notification.data);
      const data = action.notification.data;
      if (data?.['type'] === 'new_order') {
        // Navigate to dispatcher page for order notifications
        window.location.href = '/dispatcher';
      }
    },
  );

  // Handle foreground notification received (optional — app is already active)
  PushNotifications.addListener(
    'pushNotificationReceived',
    (notification: { title?: string }) => {
      console.log('[Push] Benachrichtigung im Vordergrund empfangen:', notification.title);
      // In foreground, Socket.IO already handles new orders — no extra action needed.
    },
  );
}

// ---------------------------------------------------------------------------
// Send FCM token to backend
// ---------------------------------------------------------------------------

async function sendTokenToBackend(token: string, platform: string): Promise<void> {
  const apiUrl = import.meta.env['VITE_API_URL'] ?? '';
  const accessToken = localStorage.getItem('kassomat_access_token');

  if (!accessToken) {
    console.warn('[Push] Kein Access-Token vorhanden — Token-Registrierung übersprungen');
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token, platform }),
    });

    if (!response.ok) {
      console.error('[Push] Token-Registrierung fehlgeschlagen:', response.status);
    } else {
      console.log('[Push] FCM Token erfolgreich registriert');
    }
  } catch (err) {
    console.error('[Push] Token-Registrierung Netzwerkfehler:', err);
  }
}

// ---------------------------------------------------------------------------
// Unregister push token (call on logout)
// ---------------------------------------------------------------------------

export async function unregisterPushToken(): Promise<void> {
  let Capacitor: { isNativePlatform: () => boolean };
  try {
    const core = await import('@capacitor/core');
    Capacitor = core.Capacitor;
  } catch {
    return;
  }

  if (!Capacitor.isNativePlatform()) return;

  // We don't have the token cached, so we just remove all listeners.
  // The backend token will become stale and get cleaned up automatically
  // when Firebase reports it as invalid.
  try {
    const mod = await loadModule('@capacitor/push-notifications');
    await mod.PushNotifications.removeAllListeners();
  } catch {
    // Ignore — graceful cleanup
  }
}
