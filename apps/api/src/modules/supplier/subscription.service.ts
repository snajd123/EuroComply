/**
 * Supplier Subscription Service
 * SaaS subscription management for suppliers
 */

import { prisma } from '@eurocomply/database';

// Plan configuration
export const PLANS = {
  STARTER: {
    name: 'Starter',
    price: 49,
    dppLimit: 50,
    stripePriceId: process.env['STRIPE_PRICE_STARTER'] || 'price_starter',
  },
  GROWTH: {
    name: 'Growth',
    price: 149,
    dppLimit: 500,
    stripePriceId: process.env['STRIPE_PRICE_GROWTH'] || 'price_growth',
  },
  PRO: {
    name: 'Pro',
    price: 399,
    dppLimit: 2000,
    stripePriceId: process.env['STRIPE_PRICE_PRO'] || 'price_pro',
  },
} as const;

export type PlanType = keyof typeof PLANS;

// ===========================================
// SUBSCRIPTION MANAGEMENT
// ===========================================

export async function getSubscription(supplierId: string) {
  const subscription = await prisma.supplierSubscription.findUnique({
    where: { supplierId },
  });

  if (!subscription) {
    return null;
  }

  const plan = PLANS[subscription.plan as PlanType];

  return {
    id: subscription.id,
    plan: subscription.plan,
    planName: plan?.name || subscription.plan,
    status: subscription.status,
    dppLimit: subscription.dppLimit,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    trialEndsAt: subscription.trialEndsAt,
  };
}

export async function getSubscriptionUsage(supplierId: string) {
  const [subscription, productCount] = await Promise.all([
    prisma.supplierSubscription.findUnique({
      where: { supplierId },
    }),
    prisma.supplierProduct.count({
      where: { supplierId },
    }),
  ]);

  if (!subscription) {
    return {
      hasSubscription: false,
      dppCount: productCount,
      dppLimit: 0,
      canCreateDpp: false,
    };
  }

  const isActive = ['ACTIVE', 'TRIALING'].includes(subscription.status);

  return {
    hasSubscription: true,
    plan: subscription.plan,
    status: subscription.status,
    dppCount: productCount,
    dppLimit: subscription.dppLimit,
    canCreateDpp: isActive && productCount < subscription.dppLimit,
    percentUsed: Math.round((productCount / subscription.dppLimit) * 100),
  };
}

export async function checkDppQuota(supplierId: string): Promise<{ allowed: boolean; reason?: string }> {
  const usage = await getSubscriptionUsage(supplierId);

  if (!usage.hasSubscription) {
    return {
      allowed: false,
      reason: 'No active subscription. Please subscribe to a plan.',
    };
  }

  if (!['ACTIVE', 'TRIALING'].includes(usage.status!)) {
    return {
      allowed: false,
      reason: `Subscription status is ${usage.status}. Please update your payment method.`,
    };
  }

  if (usage.dppCount >= usage.dppLimit) {
    return {
      allowed: false,
      reason: `DPP limit reached (${usage.dppCount}/${usage.dppLimit}). Please upgrade your plan.`,
    };
  }

  return { allowed: true };
}

// ===========================================
// STRIPE CHECKOUT
// ===========================================

export async function createCheckoutSession(supplierId: string, plan: PlanType) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { email: true, companyName: true },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  const planConfig = PLANS[plan];
  if (!planConfig) {
    throw new Error('Invalid plan');
  }

  // Check if Stripe is configured
  if (!process.env['STRIPE_SECRET_KEY']) {
    throw new Error('Stripe is not configured');
  }

  // Dynamic import to avoid issues when Stripe is not installed
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env['STRIPE_SECRET_KEY']);

  // Check for existing customer
  let existingSubscription = await prisma.supplierSubscription.findUnique({
    where: { supplierId },
  });

  let customerId = existingSubscription?.stripeCustomerId;

  // Create or get Stripe customer
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: supplier.email,
      name: supplier.companyName,
      metadata: { supplierId },
    });
    customerId = customer.id;
  }

  // Create checkout session
  const dashboardUrl = process.env['DASHBOARD_URL'] || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{
      price: planConfig.stripePriceId,
      quantity: 1,
    }],
    success_url: `${dashboardUrl}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${dashboardUrl}/onboarding/plan`,
    metadata: {
      supplierId,
      plan,
    },
    tax_id_collection: { enabled: true },
    subscription_data: {
      metadata: {
        supplierId,
        plan,
      },
    },
  });

  // Create or update subscription record with incomplete status
  if (existingSubscription) {
    await prisma.supplierSubscription.update({
      where: { supplierId },
      data: {
        stripeCustomerId: customerId,
        plan: plan,
        status: 'INCOMPLETE',
        dppLimit: planConfig.dppLimit,
      },
    });
  } else {
    await prisma.supplierSubscription.create({
      data: {
        supplierId,
        stripeCustomerId: customerId,
        plan: plan,
        status: 'INCOMPLETE',
        dppLimit: planConfig.dppLimit,
      },
    });
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

export async function createBillingPortalSession(supplierId: string) {
  const subscription = await prisma.supplierSubscription.findUnique({
    where: { supplierId },
  });

  if (!subscription?.stripeCustomerId) {
    throw new Error('No subscription found');
  }

  if (!process.env['STRIPE_SECRET_KEY']) {
    throw new Error('Stripe is not configured');
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env['STRIPE_SECRET_KEY']);

  const dashboardUrl = process.env['DASHBOARD_URL'] || 'http://localhost:3000';

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${dashboardUrl}/settings/billing`,
  });

  return { url: session.url };
}

// ===========================================
// STRIPE WEBHOOK HANDLERS
// ===========================================

export async function handleCheckoutCompleted(session: any) {
  const supplierId = session.metadata?.supplierId;
  const plan = session.metadata?.plan as PlanType;

  if (!supplierId) {
    console.error('No supplierId in checkout session metadata');
    return;
  }

  const planConfig = PLANS[plan] || PLANS.STARTER;

  await prisma.supplierSubscription.update({
    where: { supplierId },
    data: {
      stripeSubscriptionId: session.subscription,
      status: 'ACTIVE',
      plan: plan || 'STARTER',
      dppLimit: planConfig.dppLimit,
    },
  });
}

export async function handleSubscriptionUpdated(subscription: any) {
  const supplierId = subscription.metadata?.supplierId;

  if (!supplierId) {
    // Try to find by customer ID
    const existingSub = await prisma.supplierSubscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!existingSub) {
      console.error('Could not find supplier for subscription', subscription.id);
      return;
    }
  }

  // Map Stripe status to our status
  const statusMap: Record<string, string> = {
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    unpaid: 'UNPAID',
    trialing: 'TRIALING',
    incomplete: 'INCOMPLETE',
    incomplete_expired: 'INCOMPLETE_EXPIRED',
  };

  const status = statusMap[subscription.status] || 'ACTIVE';

  await prisma.supplierSubscription.updateMany({
    where: {
      OR: [
        { stripeSubscriptionId: subscription.id },
        supplierId ? { supplierId } : {},
      ],
    },
    data: {
      status: status as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

export async function handleSubscriptionDeleted(subscription: any) {
  await prisma.supplierSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: 'CANCELED',
    },
  });
}

export async function handleInvoicePaymentFailed(invoice: any) {
  const subscriptionId = invoice.subscription;

  await prisma.supplierSubscription.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: 'PAST_DUE',
    },
  });
}
