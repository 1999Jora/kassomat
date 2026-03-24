import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/crypto';
import { NotFoundError, AppError } from '../../lib/errors';

// ---------------------------------------------------------------------------
// Wix Stores API v1 types
// ---------------------------------------------------------------------------

interface WixCollection {
  id: string;
  name: string;
}

interface WixProductMedia {
  mainMedia?: {
    image?: {
      url?: string;
    };
  };
}

interface WixProduct {
  id: string;
  name: string;
  price?: {
    price?: string; // e.g. "9.90"
    discountedPrice?: string;
  };
  priceData?: {
    price?: string;
    discountedPrice?: string;
  };
  visible: boolean;
  /** Wix v1 query returns only IDs; we enrich with names from fetchAllCollections */
  collectionIds?: string[];
  /** Enriched after fetching collection names */
  collections?: WixCollection[];
  media?: WixProductMedia;
  manageVariants?: boolean;
  productType?: string;
}

interface WixQueryResponse {
  products: WixProduct[];
  metadata?: {
    count?: number;
    offset?: number;
    total?: number;
    items?: number;
  };
  totalResults?: number;
}

interface WixCollectionsResponse {
  collections?: WixCollection[];
  metadata?: {
    count?: number;
    offset?: number;
    total?: number;
  };
  totalResults?: number;
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface SyncProductsResult {
  created: number;
  updated: number;
  deleted: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Wix price string like "9.90" to integer cents (990).
 */
function priceToCents(priceStr: string | null | undefined): number {
  if (!priceStr) return 0;
  const parsed = parseFloat(priceStr);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

/**
 * Map Prisma VatRate numeric value to the Prisma enum string.
 * The schema maps: VAT_0 → "0", VAT_10 → "10", VAT_20 → "20"
 */
function toVatRateEnum(rate: 0 | 10 | 20): 'VAT_0' | 'VAT_10' | 'VAT_20' {
  if (rate === 0) return 'VAT_0';
  if (rate === 10) return 'VAT_10';
  return 'VAT_20';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WixProductsService {
  /**
   * Fetch ALL products from the Wix Stores v1 API with pagination.
   * Wix returns at most 100 products per request; we page through using offset.
   */
  private async fetchAllWixProducts(apiKey: string, siteId: string): Promise<WixProduct[]> {
    const allProducts: WixProduct[] = [];
    const limit = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch('https://www.wixapis.com/stores/v1/products/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Wix API keys: no "Bearer" prefix, requires wix-site-id header
          Authorization: apiKey,
          'wix-site-id': siteId,
        },
        body: JSON.stringify({
          query: {
            paging: { limit, offset },
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new AppError(
          502,
          'WIX_API_ERROR',
          `Wix API returned ${response.status}: ${text.slice(0, 200)}`,
        );
      }

      const json = (await response.json()) as WixQueryResponse;
      const batch = json.products ?? [];
      allProducts.push(...batch);

      // Wix returns total in metadata or totalResults; stop when we've fetched all
      const total = json.totalResults ?? json.metadata?.total ?? json.metadata?.items ?? null;
      offset += batch.length;

      if (batch.length < limit || (total !== null && offset >= total)) {
        hasMore = false;
      }
    }

    return allProducts;
  }

  /**
   * Fetch ALL collections from the Wix Stores v1 API.
   * Returns a Map of collection ID → collection name.
   */
  private async fetchAllCollections(
    apiKey: string,
    siteId: string,
  ): Promise<Map<string, string>> {
    const idToName = new Map<string, string>();
    const limit = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch('https://www.wixapis.com/stores/v1/collections/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
          'wix-site-id': siteId,
        },
        body: JSON.stringify({
          query: { paging: { limit, offset } },
        }),
      });

      if (!response.ok) {
        // Non-fatal: if collections can't be fetched, fall back to "Wix" category
        break;
      }

      const json = (await response.json()) as WixCollectionsResponse;
      const batch = json.collections ?? [];

      for (const col of batch) {
        idToName.set(col.id, col.name);
      }

      const total = json.totalResults ?? json.metadata?.total ?? null;
      offset += batch.length;

      if (batch.length < limit || (total !== null && offset >= total)) {
        hasMore = false;
      }
    }

    return idToName;
  }

  /**
   * Find or create the fallback "Wix" category for a tenant.
   */
  private async getOrCreateWixCategory(tenantId: string): Promise<string> {
    const existing = await prisma.category.findFirst({
      where: { tenantId, name: 'Wix' },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await prisma.category.create({
      data: {
        tenantId,
        name: 'Wix',
        color: '#6B7280',
        sortOrder: 999,
      },
      select: { id: true },
    });
    return created.id;
  }

  // Distinct colors for auto-created Wix categories
  private static readonly CATEGORY_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
    '#06B6D4', '#A855F7', '#F43F5E', '#22C55E', '#EAB308',
  ];

  private colorIndexForName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return WixProductsService.CATEGORY_COLORS[hash % WixProductsService.CATEGORY_COLORS.length]!;
  }

  /**
   * Resolve a category ID from Wix collection names.
   * Matches existing categories case-insensitively, or creates a new one from the Wix collection.
   * Falls back to the "Wix" catch-all only if no collections are provided.
   */
  private async resolveCategoryId(
    tenantId: string,
    collections: WixCollection[] | undefined,
    wixCategoryId: string,
    categoryCache: Map<string, string>,
    sortOrderCounter: { value: number },
  ): Promise<string> {
    if (!collections || collections.length === 0) {
      return wixCategoryId;
    }

    // Use the first non-"All Products" collection
    const preferred = collections.find(
      (c) => !['all products', 'alle produkte', 'featured products'].includes(c.name.toLowerCase()),
    ) ?? collections[0]!;

    const cacheKey = `${tenantId}:${preferred.name.toLowerCase()}`;
    const cached = categoryCache.get(cacheKey);
    if (cached) return cached;

    // Try to find existing category
    const match = await prisma.category.findFirst({
      where: { tenantId, name: { equals: preferred.name, mode: 'insensitive' } },
      select: { id: true },
    });

    if (match) {
      categoryCache.set(cacheKey, match.id);
      return match.id;
    }

    // Create new category from Wix collection
    const color = this.colorIndexForName(preferred.name);
    const created = await prisma.category.create({
      data: {
        tenantId,
        name: preferred.name,
        color,
        sortOrder: sortOrderCounter.value++,
      },
      select: { id: true },
    });
    categoryCache.set(cacheKey, created.id);
    return created.id;
  }

  /**
   * Sync all products for a tenant from Wix.
   *
   * Steps:
   *   1. Load tenant config, decrypt API key
   *   2. Fetch all collections (to resolve names for collectionIds)
   *   3. Fetch all products from Wix
   *   4. Upsert each product into the local DB
   *   5. Soft-delete any local products that are no longer in Wix
   *
   * @returns { created, updated, deleted }
   */
  async syncProducts(tenantId: string): Promise<SyncProductsResult> {
    // ── 1. Load + validate tenant config ────────────────────────────────────
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        wixIsActive: true,
        wixSiteId: true,
        wixApiKey_encrypted: true,
      },
    });

    if (!tenant) throw new NotFoundError('Tenant');

    if (!tenant.wixIsActive) {
      throw new AppError(
        403,
        'INTEGRATION_DISABLED',
        'Wix integration is not active for this tenant',
      );
    }

    if (!tenant.wixApiKey_encrypted || !tenant.wixSiteId) {
      throw new AppError(
        500,
        'CONFIGURATION_ERROR',
        'Wix API key and Site ID must be configured',
      );
    }

    const apiKey = decrypt(tenant.wixApiKey_encrypted);

    // ── 2. Fetch all Wix collections → build id→name map ────────────────────
    const collectionMap = await this.fetchAllCollections(apiKey, tenant.wixSiteId);

    // ── 3. Fetch all Wix products ────────────────────────────────────────────
    const wixProducts = await this.fetchAllWixProducts(apiKey, tenant.wixSiteId);

    // Enrich products: resolve collectionIds → WixCollection[] using the map
    for (const product of wixProducts) {
      if (!product.collections && product.collectionIds && product.collectionIds.length > 0) {
        product.collections = product.collectionIds
          .filter((id) => collectionMap.has(id))
          .map((id) => ({ id, name: collectionMap.get(id)! }));
      }
    }

    // ── 4. Resolve the fallback "Wix" category once ─────────────────────────
    const wixCategoryId = await this.getOrCreateWixCategory(tenantId);
    const categoryCache = new Map<string, string>();
    const sortOrderCounter = { value: 0 };

    // ── 5. Load existing local products mapped by wixProductId ──────────────
    const existingProducts = await prisma.product.findMany({
      where: {
        tenantId,
        wixProductId: { not: null },
        deletedAt: null,
      },
      select: { id: true, wixProductId: true },
    });

    const existingByWixId = new Map<string, string>(
      existingProducts.map((p) => [p.wixProductId as string, p.id]),
    );

    // Track which wixProductIds we've seen in this sync pass
    const seenWixIds = new Set<string>();

    let created = 0;
    let updated = 0;

    // ── 6. Upsert each Wix product ───────────────────────────────────────────
    for (const wixProduct of wixProducts) {
      seenWixIds.add(wixProduct.id);

      // Resolve price — prefer priceData (newer field), fall back to price
      const rawPrice =
        wixProduct.priceData?.price ??
        wixProduct.priceData?.discountedPrice ??
        wixProduct.price?.price ??
        wixProduct.price?.discountedPrice ??
        '0';

      const priceInCents = priceToCents(rawPrice);

      // Resolve category from Wix collections
      const categoryId = await this.resolveCategoryId(
        tenantId,
        wixProduct.collections,
        wixCategoryId,
        categoryCache,
        sortOrderCounter,
      );

      const productData = {
        name: wixProduct.name,
        price: priceInCents,
        vatRate: toVatRateEnum(20), // default 20%; user can change later
        categoryId,
        isActive: wixProduct.visible,
        wixProductId: wixProduct.id,
        tenantId,
        // Clear soft-delete if the product was previously deleted
        deletedAt: null,
      };

      const existingLocalId = existingByWixId.get(wixProduct.id);

      if (existingLocalId) {
        // Update
        await prisma.product.update({
          where: { id: existingLocalId },
          data: productData,
        });
        updated++;
      } else {
        // Check if previously soft-deleted
        const softDeleted = await prisma.product.findFirst({
          where: { tenantId, wixProductId: wixProduct.id },
          select: { id: true },
        });

        if (softDeleted) {
          await prisma.product.update({
            where: { id: softDeleted.id },
            data: productData,
          });
          updated++;
        } else {
          // Create new
          await prisma.product.create({ data: productData });
          created++;
        }
      }
    }

    // ── 7. Soft-delete products no longer in Wix ────────────────────────────
    const toDelete = existingProducts.filter(
      (p) => p.wixProductId && !seenWixIds.has(p.wixProductId),
    );

    let deleted = 0;
    if (toDelete.length > 0) {
      const result = await prisma.product.updateMany({
        where: {
          id: { in: toDelete.map((p) => p.id) },
          tenantId,
        },
        data: { deletedAt: new Date() },
      });
      deleted = result.count;
    }

    return { created, updated, deleted };
  }
}
