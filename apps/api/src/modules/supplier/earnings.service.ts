/**
 * Supplier Earnings Service
 * Business logic for supplier earnings and payouts
 */

import { prisma } from '@eurocomply/database';
import { Decimal } from '@prisma/client/runtime/library';

// Type definitions for Prisma models (when types unavailable)
type DppUsageEvent = {
  id: string;
  supplierId: string;
  supplierProductId: string;
  retailerShop: string;
  usageType: string;
  priceCharged: Decimal;
  supplierShare: Decimal;
  platformShare: Decimal;
  distributorId: string | null;
  distributorShare: Decimal;
  billingStatus: string;
  billingPeriodStart: Date | null;
  billingPeriodEnd: Date | null;
  createdAt: Date;
  supplierProduct: { name: string };
};

type SupplierProduct = {
  id: string;
  name: string;
  category: string;
  visibility: string;
  price: Decimal;
  timesSubscribed: number;
  usageEvents: DppUsageEvent[];
};

type SupplierEarning = {
  id: string;
  supplierId: string;
  periodStart: Date;
  periodEnd: Date;
  grossEarnings: Decimal;
  distributorPayouts: Decimal;
  platformFee: Decimal;
  netEarnings: Decimal;
  subscriptionCount: number;
  referralCount: number;
  payoutStatus: string;
};

type SupplierPayout = {
  id: string;
  supplierId: string;
  amount: Decimal;
  currency: string;
  status: string;
  failureReason: string | null;
  initiatedAt: Date;
  completedAt: Date | null;
};

// Pricing constants
const MINIMUM_PRICE = 0.50;           // €0.50 floor per product/month
const SUPPLIER_SHARE = 0.80;          // 80% to supplier (before distributor cut)
const PLATFORM_SHARE = 0.20;          // 20% to EuroComply (fixed)
const MAX_DISTRIBUTOR_SHARE = 0.30;   // Max 30% of supplier share for referrals
const MINIMUM_PAYOUT = 10.00;

// ===========================================
// EARNINGS OVERVIEW
// ===========================================

export async function getEarningsOverview(supplierId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Get current month usage events
  const currentMonthEvents = await prisma.dppUsageEvent.findMany({
    where: {
      supplierId,
      createdAt: { gte: startOfMonth },
    },
  });

  // Get last month usage events for comparison
  const lastMonthEvents = await prisma.dppUsageEvent.findMany({
    where: {
      supplierId,
      createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
    },
  });

  // Get all-time earnings
  const allTimeEarnings = await prisma.supplierEarning.aggregate({
    where: { supplierId },
    _sum: { netEarnings: true },
  });

  // Get pending payout (unpaid earnings)
  const pendingEarnings = await prisma.supplierEarning.aggregate({
    where: {
      supplierId,
      payoutStatus: { in: ['PENDING', 'HELD'] },
    },
    _sum: { netEarnings: true },
  });

  // Calculate this month's earnings
  const thisMonthEarnings = currentMonthEvents.reduce((sum: number, event: { supplierShare: Decimal }) => {
    return sum + Number(event.supplierShare);
  }, 0);

  const lastMonthEarnings = lastMonthEvents.reduce((sum: number, event: { supplierShare: Decimal }) => {
    return sum + Number(event.supplierShare);
  }, 0);

  // Calculate month-over-month growth
  const monthOverMonthGrowth = lastMonthEarnings > 0
    ? ((thisMonthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100
    : thisMonthEarnings > 0 ? 100 : 0;

  // Count subscriptions this month
  const thisMonthSubscriptions = currentMonthEvents.filter(
    (e: { usageType: string }) => e.usageType === 'SUBSCRIPTION_MONTHLY'
  ).length;

  return {
    thisMonth: {
      earnings: thisMonthEarnings,
      subscriptions: thisMonthSubscriptions,
    },
    lastMonth: {
      earnings: lastMonthEarnings,
    },
    monthOverMonthGrowth: Math.round(monthOverMonthGrowth * 10) / 10,
    allTime: {
      earnings: Number(allTimeEarnings._sum.netEarnings || 0),
    },
    pendingPayout: {
      amount: Number(pendingEarnings._sum.netEarnings || 0),
      canWithdraw: Number(pendingEarnings._sum.netEarnings || 0) >= MINIMUM_PAYOUT,
      minimumAmount: MINIMUM_PAYOUT,
    },
  };
}

// ===========================================
// PRODUCT EARNINGS
// ===========================================

export async function getProductEarnings(supplierId: string) {
  const products = await prisma.supplierProduct.findMany({
    where: { supplierId },
    include: {
      usageEvents: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  return (products as SupplierProduct[]).map((product: SupplierProduct) => {
    const totalEarnings = product.usageEvents.reduce((sum: number, event: DppUsageEvent) => {
      return sum + Number(event.supplierShare);
    }, 0);

    // Count active subscriptions (unique retailerShop)
    const activeSubscriptions = new Set(
      product.usageEvents
        .filter((e: DppUsageEvent) => e.billingStatus === 'PAID')
        .map((e: DppUsageEvent) => e.retailerShop)
    ).size;

    return {
      id: product.id,
      name: product.name,
      category: product.category,
      visibility: product.visibility,
      price: Number(product.price),
      stats: {
        activeSubscriptions,
        timesSubscribed: product.timesSubscribed,
      },
      earnings: {
        monthly: activeSubscriptions * Number(product.price) * SUPPLIER_SHARE,
        total: totalEarnings,
      },
    };
  }).sort((a: { earnings: { total: number } }, b: { earnings: { total: number } }) => b.earnings.total - a.earnings.total);
}

// ===========================================
// EARNINGS HISTORY
// ===========================================

export async function getEarningsHistory(
  supplierId: string,
  options: { page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 12 } = options;
  const skip = (page - 1) * limit;

  const [earnings, total] = await Promise.all([
    prisma.supplierEarning.findMany({
      where: { supplierId },
      orderBy: { periodStart: 'desc' },
      skip,
      take: limit,
    }),
    prisma.supplierEarning.count({ where: { supplierId } }),
  ]);

  return {
    earnings: (earnings as SupplierEarning[]).map((e: SupplierEarning) => ({
      id: e.id,
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      grossEarnings: Number(e.grossEarnings),
      distributorPayouts: Number(e.distributorPayouts),
      platformFee: Number(e.platformFee),
      netEarnings: Number(e.netEarnings),
      subscriptionCount: e.subscriptionCount,
      referralCount: e.referralCount,
      payoutStatus: e.payoutStatus,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ===========================================
// RECENT USAGE EVENTS
// ===========================================

export async function getRecentUsageEvents(
  supplierId: string,
  options: { limit?: number } = {}
) {
  const { limit = 20 } = options;

  const events = await prisma.dppUsageEvent.findMany({
    where: { supplierId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      supplierProduct: {
        select: { name: true },
      },
    },
  });

  return (events as DppUsageEvent[]).map((event: DppUsageEvent) => ({
    id: event.id,
    type: event.usageType,
    retailerShop: event.retailerShop,
    productName: event.supplierProduct.name,
    priceCharged: Number(event.priceCharged),
    supplierShare: Number(event.supplierShare),
    distributorShare: Number(event.distributorShare),
    billingStatus: event.billingStatus,
    createdAt: event.createdAt,
  }));
}

// ===========================================
// PAYOUT MANAGEMENT
// ===========================================

export async function getPayoutSettings(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      stripeConnectAccountId: true,
      payoutEnabled: true,
      payoutMinimum: true,
    },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  return {
    stripeConnected: !!supplier.stripeConnectAccountId,
    payoutEnabled: supplier.payoutEnabled,
    minimumPayout: Number(supplier.payoutMinimum),
  };
}

export async function getPayoutHistory(
  supplierId: string,
  options: { page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const [payouts, total] = await Promise.all([
    prisma.supplierPayout.findMany({
      where: { supplierId },
      orderBy: { initiatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.supplierPayout.count({ where: { supplierId } }),
  ]);

  return {
    payouts: (payouts as SupplierPayout[]).map((p: SupplierPayout) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      failureReason: p.failureReason,
      initiatedAt: p.initiatedAt,
      completedAt: p.completedAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function requestPayout(supplierId: string) {
  // Get pending earnings
  const pendingEarnings = await prisma.supplierEarning.aggregate({
    where: {
      supplierId,
      payoutStatus: { in: ['PENDING', 'HELD'] },
    },
    _sum: { netEarnings: true },
  });

  const amount = Number(pendingEarnings._sum.netEarnings || 0);

  if (amount < MINIMUM_PAYOUT) {
    throw new Error(`Minimum payout amount is €${MINIMUM_PAYOUT}. Current balance: €${amount.toFixed(2)}`);
  }

  // Check if Stripe is connected
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { stripeConnectAccountId: true, payoutEnabled: true },
  });

  if (!supplier?.stripeConnectAccountId) {
    throw new Error('Please connect your Stripe account to receive payouts');
  }

  if (!supplier.payoutEnabled) {
    throw new Error('Payouts are not enabled for your account. Please complete Stripe onboarding.');
  }

  // Create payout record
  const payout = await prisma.supplierPayout.create({
    data: {
      supplierId,
      amount: new Decimal(amount),
      currency: 'EUR',
      status: 'PROCESSING',
    },
  });

  // Mark pending earnings as processing
  await prisma.supplierEarning.updateMany({
    where: {
      supplierId,
      payoutStatus: { in: ['PENDING', 'HELD'] },
    },
    data: {
      payoutStatus: 'PROCESSING',
      payoutId: payout.id,
    },
  });

  // TODO: Trigger actual Stripe transfer
  // This would be handled by a background job

  return {
    payoutId: payout.id,
    amount,
    status: 'PROCESSING',
    message: 'Payout request submitted. Funds will be transferred within 2-3 business days.',
  };
}

// ===========================================
// BILLING JOBS (for cron)
// ===========================================

export async function processMonthlyBilling() {
  // This would be called by a cron job at the start of each month
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Get all usage events from last month that are PAID
  const paidEvents = await prisma.dppUsageEvent.findMany({
    where: {
      billingStatus: 'PAID',
      billingPeriodStart: { gte: lastMonth },
      billingPeriodEnd: { lte: endOfLastMonth },
    },
  });

  // Group by supplier (for producers/brands)
  const supplierEarnings = new Map<string, {
    grossEarnings: number;
    distributorPayouts: number;
    platformFee: number;
    netEarnings: number;
    subscriptionCount: number;
  }>();

  // Track distributor referral earnings separately
  const distributorEarnings = new Map<string, {
    referralCount: number;
    referralEarnings: number;
  }>();

  for (const event of paidEvents) {
    // Update supplier earnings
    const existing = supplierEarnings.get(event.supplierId) || {
      grossEarnings: 0,
      distributorPayouts: 0,
      platformFee: 0,
      netEarnings: 0,
      subscriptionCount: 0,
    };

    existing.grossEarnings += Number(event.priceCharged);
    existing.platformFee += Number(event.platformShare);
    existing.netEarnings += Number(event.supplierShare);
    existing.subscriptionCount++;

    // Track distributor payout if there was a referral
    if (event.distributorId) {
      const distributorShare = Number(event.distributorShare);
      existing.distributorPayouts += distributorShare;

      // Track distributor's referral earnings
      const distEarning = distributorEarnings.get(event.distributorId) || {
        referralCount: 0,
        referralEarnings: 0,
      };
      distEarning.referralCount++;
      distEarning.referralEarnings += distributorShare;
      distributorEarnings.set(event.distributorId, distEarning);
    }

    supplierEarnings.set(event.supplierId, existing);
  }

  // Create earning records for suppliers
  for (const [supplierId, data] of supplierEarnings) {
    await prisma.supplierEarning.upsert({
      where: {
        supplierId_periodStart: {
          supplierId,
          periodStart: lastMonth,
        },
      },
      create: {
        supplierId,
        periodStart: lastMonth,
        periodEnd: endOfLastMonth,
        grossEarnings: new Decimal(data.grossEarnings),
        distributorPayouts: new Decimal(data.distributorPayouts),
        platformFee: new Decimal(data.platformFee),
        netEarnings: new Decimal(data.netEarnings),
        subscriptionCount: data.subscriptionCount,
        referralCount: 0,
        payoutStatus: data.netEarnings >= MINIMUM_PAYOUT ? 'PENDING' : 'HELD',
      },
      update: {
        grossEarnings: new Decimal(data.grossEarnings),
        distributorPayouts: new Decimal(data.distributorPayouts),
        platformFee: new Decimal(data.platformFee),
        netEarnings: new Decimal(data.netEarnings),
        subscriptionCount: data.subscriptionCount,
      },
    });
  }

  // Create/update earning records for distributors (referral earnings)
  for (const [distributorId, data] of distributorEarnings) {
    await prisma.supplierEarning.upsert({
      where: {
        supplierId_periodStart: {
          supplierId: distributorId,
          periodStart: lastMonth,
        },
      },
      create: {
        supplierId: distributorId,
        periodStart: lastMonth,
        periodEnd: endOfLastMonth,
        grossEarnings: new Decimal(data.referralEarnings),
        distributorPayouts: new Decimal(0),
        platformFee: new Decimal(0), // No platform fee on referral earnings
        netEarnings: new Decimal(data.referralEarnings),
        subscriptionCount: 0,
        referralCount: data.referralCount,
        payoutStatus: data.referralEarnings >= MINIMUM_PAYOUT ? 'PENDING' : 'HELD',
      },
      update: {
        // Add to existing earnings if distributor also has direct products
        grossEarnings: { increment: data.referralEarnings },
        netEarnings: { increment: data.referralEarnings },
        referralCount: data.referralCount,
      },
    });
  }

  return {
    processedSuppliers: supplierEarnings.size,
    processedDistributors: distributorEarnings.size,
  };
}
