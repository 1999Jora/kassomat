import { format } from 'date-fns';
import { prisma } from '../../lib/prisma';
import { rksvQueue } from '../../lib/queue';
import { ValidationError } from '../../lib/errors';

export class ClosingService {
  /** Tagesabschluss */
  async dailyClose(tenantId: string, closedBy: string, cashCount: number, notes?: string) {
    const today = format(new Date(), 'yyyy-MM-dd');

    const existing = await prisma.dailyClosing.findUnique({
      where: { tenantId_date: { tenantId, date: today } },
    });
    if (existing) throw new ValidationError('Tagesabschluss für heute wurde bereits durchgeführt');

    // Alle Bons des Tages summieren
    const todayStart = new Date(`${today}T00:00:00`);
    const todayEnd = new Date(`${today}T23:59:59`);

    const bons = await prisma.receipt.findMany({
      where: {
        tenantId,
        type: { in: ['sale', 'cancellation'] },
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });

    let totalCash = 0, totalCard = 0, totalOnline = 0;
    let receiptCount = 0, cancellationCount = 0;

    for (const bon of bons) {
      const gross = bon.totalGross;
      if (bon.paymentMethod === 'cash') totalCash += gross;
      else if (bon.paymentMethod === 'card') totalCard += gross;
      else totalOnline += gross;

      if (bon.type === 'sale') receiptCount++;
      else cancellationCount++;
    }

    const totalRevenue = totalCash + totalCard + totalOnline;

    const closing = await prisma.dailyClosing.create({
      data: {
        tenantId,
        date: today,
        closedBy,
        totalCash,
        totalCard,
        totalOnline,
        totalRevenue,
        receiptCount,
        cancellationCount,
      },
    });

    // DEP-Backup-Job einreihen
    await rksvQueue.add('dep_backup', { tenantId, date: today });

    return {
      ...closing,
      cashCountEntered: cashCount,
      cashDifference: cashCount - totalCash,
      summary: {
        totalRevenue,
        totalCash,
        totalCard,
        totalOnline,
        receiptCount,
        cancellationCount,
      },
    };
  }

  /** Analytics für heute */
  async analyticsToday(tenantId: string) {
    const today = format(new Date(), 'yyyy-MM-dd');
    return this.analyticsRange(tenantId, today, today);
  }

  /** Analytics für Zeitraum */
  async analyticsRange(tenantId: string, from: string, to: string) {
    const receipts = await prisma.receipt.findMany({
      where: {
        tenantId,
        type: 'sale',
        status: { in: ['signed', 'printed'] },
        createdAt: { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59`) },
      },
      include: { items: true },
    });

    const totalRevenue = receipts.reduce((s, r) => s + r.totalGross, 0);
    const receiptCount = receipts.length;
    const averageReceiptValue = receiptCount > 0 ? Math.round(totalRevenue / receiptCount) : 0;

    const revenueByChannel = { direct: 0, lieferando: 0, wix: 0 };
    const revenueByPayment = { cash: 0, card: 0, online: 0 };
    const vatBreakdown = { vat0: 0, vat10: 0, vat13: 0, vat20: 0 };
    const productTotals = new Map<string, { name: string; quantity: number; revenue: number }>();
    const hourlyRevenue = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0 }));

    for (const r of receipts) {
      revenueByChannel[r.channel] += r.totalGross;
      revenueByPayment[r.paymentMethod] += r.totalGross;
      vatBreakdown.vat0 += r.vat0;
      vatBreakdown.vat10 += r.vat10;
      vatBreakdown.vat13 += r.vat13;
      vatBreakdown.vat20 += r.vat20;

      const hour = r.createdAt.getHours();
      const hourEntry = hourlyRevenue[hour];
      if (hourEntry) hourEntry.revenue += r.totalGross;

      for (const item of r.items) {
        const entry = productTotals.get(item.productId) ?? { productName: item.productName, quantity: 0, revenue: 0 };
        entry.quantity += item.quantity;
        entry.revenue += item.totalGross;
        productTotals.set(item.productId, entry);
      }
    }

    const topProducts = Array.from(productTotals.entries())
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalRevenue,
      receiptCount,
      averageReceiptValue,
      revenueByChannel,
      revenueByPayment,
      vatBreakdown,
      topProducts,
      hourlyRevenue,
    };
  }

  /** Schicht starten */
  async startShift(tenantId: string, cashierId: string, openingFloat: number) {
    // Offene Schicht prüfen
    const openShift = await prisma.shift.findFirst({
      where: { tenantId, cashierId, endedAt: null },
    });
    if (openShift) throw new ValidationError('Es ist bereits eine Schicht aktiv');

    return prisma.shift.create({
      data: { tenantId, cashierId, openingFloat },
    });
  }

  /** Schicht beenden */
  async endShift(tenantId: string, cashierId: string, closingFloat: number) {
    const shift = await prisma.shift.findFirst({
      where: { tenantId, cashierId, endedAt: null },
    });
    if (!shift) throw new ValidationError('Keine aktive Schicht gefunden');

    // Umsatz der Schicht berechnen
    const receipts = await prisma.receipt.findMany({
      where: {
        tenantId,
        cashierId,
        type: 'sale',
        createdAt: { gte: shift.startedAt },
      },
      select: { totalGross: true },
    });

    const totalRevenue = receipts.reduce((s, r) => s + r.totalGross, 0);

    return prisma.shift.update({
      where: { id: shift.id },
      data: {
        endedAt: new Date(),
        closingFloat,
        totalRevenue,
        receiptCount: receipts.length,
      },
    });
  }
}
