// Capacitor platform detection — safe no-ops when running in browser without Capacitor

export const isNative = false;
export const isAndroid = false;

export async function initNative(): Promise<void> {
  // On Android (after pnpm install + cap:sync), this is replaced by the native bridge
  // In web preview, this is intentionally a no-op
}

export async function hapticFeedback(_style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  // No-op in browser
}
