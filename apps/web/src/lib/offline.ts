import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Product, Category } from '@kassomat/types';

export interface OfflinePendingReceipt {
  id?: number;
  localId: string;
  status: 'offline_pending' | 'syncing' | 'synced' | 'error';
  createdAt: string;
  payload: unknown;
  errorMessage?: string | null;
  attemptCount: number;
}

export interface CachedProduct extends Product {
  cachedAt: string;
}

export interface CachedCategory extends Category {
  cachedAt: string;
}

class KassomatDB extends Dexie {
  products!: Table<CachedProduct, string>;
  categories!: Table<CachedCategory, string>;
  offlineReceipts!: Table<OfflinePendingReceipt, number>;

  constructor() {
    super('KassomatDB');
    this.version(2).stores({
      products: 'id, tenantId, categoryId, pluCode, barcode, isActive, cachedAt',
      categories: 'id, tenantId, sortOrder, cachedAt',
      offlineReceipts: '++id, localId, status, createdAt',
    });
  }
}

export const db = new KassomatDB();

// ── Product helpers ───────────────────────────────────────────────────────────

export async function cacheProducts(products: Product[]): Promise<void> {
  const now = new Date().toISOString();
  await db.products.bulkPut(products.map((p) => ({ ...p, cachedAt: now })));
}

export async function cacheCategories(categories: Category[]): Promise<void> {
  const now = new Date().toISOString();
  await db.categories.bulkPut(categories.map((c) => ({ ...c, cachedAt: now })));
}

// ── Offline receipts ──────────────────────────────────────────────────────────

export async function queueOfflineReceipt(localId: string, payload: unknown): Promise<void> {
  await db.offlineReceipts.add({
    localId,
    status: 'offline_pending',
    createdAt: new Date().toISOString(),
    payload,
    errorMessage: null,
    attemptCount: 0,
  });
}

export async function markReceiptSynced(localId: string): Promise<void> {
  const receipt = await db.offlineReceipts.where('localId').equals(localId).first();
  if (receipt?.id != null) {
    await db.offlineReceipts.update(receipt.id, { status: 'synced' });
  }
}

export async function markReceiptError(localId: string, errorMessage: string): Promise<void> {
  const receipt = await db.offlineReceipts.where('localId').equals(localId).first();
  if (receipt?.id != null) {
    await db.offlineReceipts.update(receipt.id, {
      status: 'error',
      errorMessage,
      attemptCount: (receipt.attemptCount ?? 0) + 1,
    });
  }
}

export async function getPendingOfflineReceipts(): Promise<OfflinePendingReceipt[]> {
  return db.offlineReceipts.where('status').equals('offline_pending').toArray();
}

// ── React hooks ───────────────────────────────────────────────────────────────

export function useCachedProducts(categoryId?: string | null): CachedProduct[] | undefined {
  return useLiveQuery(
    () =>
      categoryId
        ? db.products.where('categoryId').equals(categoryId).and((p) => p.isActive).toArray()
        : db.products.filter((p) => p.isActive).toArray(),
    [categoryId],
  );
}

export function useCachedCategories(): CachedCategory[] | undefined {
  return useLiveQuery(() => db.categories.orderBy('sortOrder').toArray());
}

export function usePendingOfflineReceipts(): OfflinePendingReceipt[] | undefined {
  return useLiveQuery(() =>
    db.offlineReceipts.where('status').equals('offline_pending').toArray(),
  );
}
