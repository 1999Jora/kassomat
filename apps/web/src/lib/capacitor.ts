import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor native shell (Android/iOS). */
export const isNative = Capacitor.isNativePlatform();

/** True when the native platform is Android. */
export const isAndroid = Capacitor.getPlatform() === 'android';

/**
 * Initialise native-only plugins (StatusBar, Keyboard).
 * Safe to call on web — it no-ops when not native.
 */
export async function initNative(): Promise<void> {
  if (!isNative) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#080a0c' });
  } catch (e) {
    console.warn('[capacitor] StatusBar init failed:', e);
  }

  try {
    // Keyboard configuration is driven by capacitor.config.ts
    // (resize: 'body', style: 'DARK'). Importing it ensures the
    // native plugin is loaded.
    await import('@capacitor/keyboard');
  } catch (e) {
    console.warn('[capacitor] Keyboard init failed:', e);
  }
}

/**
 * Trigger haptic feedback on native devices.
 * No-ops silently on web.
 */
export async function hapticFeedback(
  style: 'light' | 'medium' | 'heavy' = 'light',
): Promise<void> {
  if (!isNative) return;

  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const styles = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    } as const;
    await Haptics.impact({ style: styles[style] });
  } catch (e) {
    console.warn('[capacitor] Haptics failed:', e);
  }
}
