import { registerPlugin } from '@capacitor/core';
import api from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BluetoothDevice {
  name: string;
  address: string;
}

interface BluetoothPrinterPluginDef {
  scanDevices(): Promise<{ devices: BluetoothDevice[] }>;
  connect(options: { address: string }): Promise<void>;
  disconnect(): Promise<void>;
  print(options: { data: number[] }): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;
  getConnectedDevice(): Promise<{ device: BluetoothDevice | null }>;
}

// ── Plugin registration ──────────────────────────────────────────────────────

const STORAGE_KEY = 'kassomat_bt_printer_address';
const STORAGE_NAME_KEY = 'kassomat_bt_printer_name';

/**
 * The native Capacitor plugin is only available on Android.
 * On web/PWA we fall back to a no-op stub so callers never need to
 * guard against undefined.
 */
function isNativePlatform(): boolean {
  try {
    // Capacitor 6 — `Capacitor` is on the window in native shells
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    return cap?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

const NoopPlugin: BluetoothPrinterPluginDef = {
  async scanDevices() {
    console.warn('[BluetoothPrinter] scanDevices called on non-native platform');
    return { devices: [] };
  },
  async connect() {
    console.warn('[BluetoothPrinter] connect called on non-native platform');
  },
  async disconnect() {
    console.warn('[BluetoothPrinter] disconnect called on non-native platform');
  },
  async print() {
    console.warn('[BluetoothPrinter] print called on non-native platform');
  },
  async isConnected() {
    return { connected: false };
  },
  async getConnectedDevice() {
    return { device: null };
  },
};

const BluetoothPrinterNative = isNativePlatform()
  ? registerPlugin<BluetoothPrinterPluginDef>('BluetoothPrinter')
  : NoopPlugin;

// ── High-level API ───────────────────────────────────────────────────────────

/** Scan for nearby Bluetooth printers (SPP profile). */
export async function scanDevices(): Promise<BluetoothDevice[]> {
  const { devices } = await BluetoothPrinterNative.scanDevices();
  return devices;
}

/** Connect to a Bluetooth printer by MAC address. Persists the address. */
export async function connect(address: string, name?: string): Promise<void> {
  await BluetoothPrinterNative.connect({ address });
  localStorage.setItem(STORAGE_KEY, address);
  if (name) localStorage.setItem(STORAGE_NAME_KEY, name);
}

/** Disconnect from the currently connected printer. */
export async function disconnect(): Promise<void> {
  await BluetoothPrinterNative.disconnect();
}

/** Send raw ESC/POS bytes to the connected printer. */
export async function print(data: Uint8Array): Promise<void> {
  // Capacitor can't transfer Uint8Array directly — send as number[]
  await BluetoothPrinterNative.print({ data: Array.from(data) });
}

/** Check whether a Bluetooth printer is currently connected. */
export async function isConnected(): Promise<boolean> {
  const { connected } = await BluetoothPrinterNative.isConnected();
  return connected;
}

/** Get the currently connected device, or null. */
export async function getConnectedDevice(): Promise<BluetoothDevice | null> {
  const { device } = await BluetoothPrinterNative.getConnectedDevice();
  return device;
}

/** Get the last-connected printer address from localStorage. */
export function getSavedPrinterAddress(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/** Get the last-connected printer name from localStorage. */
export function getSavedPrinterName(): string | null {
  return localStorage.getItem(STORAGE_NAME_KEY);
}

/** Clear the saved printer from localStorage. */
export function clearSavedPrinter(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_NAME_KEY);
}

/**
 * Try to reconnect to the last-used Bluetooth printer.
 * Returns true if reconnection succeeded, false otherwise.
 * Silently fails — useful at app startup.
 */
export async function reconnectSavedPrinter(): Promise<boolean> {
  const address = getSavedPrinterAddress();
  if (!address) return false;
  try {
    await BluetoothPrinterNative.connect({ address });
    return true;
  } catch (err) {
    console.warn('[BluetoothPrinter] Failed to reconnect to saved printer:', err);
    return false;
  }
}

/**
 * High-level: fetch ESC/POS data for a receipt from the API,
 * then send it to the connected Bluetooth printer.
 *
 * The endpoint `GET /receipts/:id/print` already returns ESC/POS data
 * when requested with Accept: application/octet-stream.
 */
export async function printReceipt(receiptId: string): Promise<void> {
  const connected = await isConnected();
  if (!connected) {
    // Try reconnecting to last known printer
    const reconnected = await reconnectSavedPrinter();
    if (!reconnected) {
      throw new Error(
        'Kein Bluetooth-Drucker verbunden. Bitte zuerst einen Drucker verbinden.',
      );
    }
  }

  // Fetch raw ESC/POS bytes from the API
  const response = await api.get<ArrayBuffer>(`/receipts/${receiptId}/print`, {
    responseType: 'arraybuffer',
    headers: { Accept: 'application/octet-stream' },
  });

  const escposData = new Uint8Array(response.data);
  if (escposData.length === 0) {
    throw new Error('Keine Druckdaten vom Server erhalten.');
  }

  await print(escposData);
}

/**
 * Returns true if running on a native platform that supports Bluetooth printing.
 */
export function isBluetoothPrintingAvailable(): boolean {
  return isNativePlatform();
}
