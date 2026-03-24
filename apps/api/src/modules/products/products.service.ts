import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError } from '../../lib/errors';
import { parse } from 'csv-parse/sync';

export interface CreateProductInput {
  name: string;
  price: number;
  vatRate: 0 | 10 | 20;
  categoryId: string;
  pluCode?: string | null;
  barcode?: string | null;
  color?: string | null;
  lieferandoExternalId?: string | null;
  wixProductId?: string | null;
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  isActive?: boolean;
}

export interface ListProductsInput {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  isActive?: boolean;
}

const VAT_MAP: Record<string, 'VAT_0' | 'VAT_10' | 'VAT_20'> = {
  '0': 'VAT_0', '10': 'VAT_10', '20': 'VAT_20',
};

export class ProductsService {
  async list(tenantId: string, input: ListProductsInput = {}) {
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 50, 200);
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId,
      deletedAt: null,
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.categoryId && { categoryId: input.categoryId }),
      ...(input.search && {
        OR: [
          { name: { contains: input.search, mode: 'insensitive' as const } },
          { pluCode: { contains: input.search } },
          { barcode: { contains: input.search } },
        ],
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({ where, skip, take: pageSize, orderBy: { name: 'asc' } }),
      prisma.product.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  async create(tenantId: string, input: CreateProductInput) {
    // Kategorie gehört zum Tenant?
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, tenantId },
    });
    if (!category) throw new NotFoundError('Kategorie');

    return prisma.product.create({
      data: {
        tenantId,
        name: input.name,
        price: input.price,
        vatRate: VAT_MAP[String(input.vatRate)] ?? 'VAT_20',
        categoryId: input.categoryId,
        pluCode: input.pluCode ?? null,
        barcode: input.barcode ?? null,
        color: input.color ?? null,
        lieferandoExternalId: input.lieferandoExternalId ?? null,
        wixProductId: input.wixProductId ?? null,
      },
    });
  }

  async update(tenantId: string, productId: string, input: UpdateProductInput) {
    const product = await this.findOwned(tenantId, productId);

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData['name'] = input.name;
    if (input.price !== undefined) updateData['price'] = input.price;
    if (input.vatRate !== undefined) updateData['vatRate'] = VAT_MAP[String(input.vatRate)];
    if (input.categoryId !== undefined) updateData['categoryId'] = input.categoryId;
    if (input.pluCode !== undefined) updateData['pluCode'] = input.pluCode;
    if (input.barcode !== undefined) updateData['barcode'] = input.barcode;
    if (input.color !== undefined) updateData['color'] = input.color;
    if (input.isActive !== undefined) updateData['isActive'] = input.isActive;
    if (input.lieferandoExternalId !== undefined) updateData['lieferandoExternalId'] = input.lieferandoExternalId;
    if (input.wixProductId !== undefined) updateData['wixProductId'] = input.wixProductId;

    return prisma.product.update({ where: { id: product.id }, data: updateData });
  }

  /** Soft-Delete: deletedAt setzen */
  async delete(tenantId: string, productId: string): Promise<void> {
    await this.findOwned(tenantId, productId);
    await prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /** CSV-Import für Bulk-Onboarding */
  async importCSV(tenantId: string, csvBuffer: Buffer): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const rows = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Erste Kategorie als Fallback
    let defaultCategory = await prisma.category.findFirst({ where: { tenantId } });
    if (!defaultCategory) {
      defaultCategory = await prisma.category.create({
        data: { tenantId, name: 'Import', color: '#6B7280', sortOrder: 0 },
      });
    }

    for (const [i, row] of rows.entries()) {
      try {
        const name = row['name'] ?? row['Name'] ?? row['artikel'];
        const priceStr = row['price'] ?? row['preis'] ?? row['Price'];
        const vatStr = row['vat'] ?? row['mwst'] ?? '20';

        if (!name || !priceStr) {
          errors.push(`Zeile ${i + 2}: Name und Preis erforderlich`);
          skipped++;
          continue;
        }

        const price = Math.round(parseFloat(priceStr.replace(',', '.')) * 100);
        const vat = [0, 10, 20].includes(Number(vatStr)) ? Number(vatStr) : 20;

        await prisma.product.create({
          data: {
            tenantId,
            name,
            price,
            vatRate: VAT_MAP[String(vat)] ?? 'VAT_20',
            categoryId: defaultCategory.id,
            pluCode: row['plu'] ?? null,
            barcode: row['barcode'] ?? null,
          },
        });
        imported++;
      } catch (err) {
        errors.push(`Zeile ${i + 2}: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  }

  private async findOwned(tenantId: string, productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
    });
    if (!product) throw new NotFoundError('Artikel');
    return product;
  }
}
