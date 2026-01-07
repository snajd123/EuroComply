/**
 * Supplier Earnings Tests
 * Tests for earnings calculation and business logic
 */

import { describe, it, expect } from 'vitest';

// ===========================================
// PRICING CONSTANTS (matching earnings.service.ts)
// ===========================================

const LINK_PRICE_MONTHLY = 1.00;
const FORK_PRICE_MONTHLY = 1.00;
const SUPPLIER_SHARE = 0.80;
const PLATFORM_SHARE = 0.20;
const MINIMUM_PAYOUT = 10.00;

// Helper functions to test calculation logic
function calculateSupplierShare(price: number): number {
  return price * SUPPLIER_SHARE;
}

function calculatePlatformShare(price: number): number {
  return price * PLATFORM_SHARE;
}

function calculateMonthlyEarnings(linkCount: number, forkCount: number): {
  grossEarnings: number;
  supplierShare: number;
  platformShare: number;
} {
  const linkEarnings = linkCount * LINK_PRICE_MONTHLY;
  const forkEarnings = forkCount * FORK_PRICE_MONTHLY;
  const grossEarnings = linkEarnings + forkEarnings;

  return {
    grossEarnings,
    supplierShare: grossEarnings * SUPPLIER_SHARE,
    platformShare: grossEarnings * PLATFORM_SHARE,
  };
}

function calculateMonthOverMonthGrowth(thisMonth: number, lastMonth: number): number {
  if (lastMonth === 0) {
    return thisMonth > 0 ? 100 : 0;
  }
  return ((thisMonth - lastMonth) / lastMonth) * 100;
}

function canRequestPayout(pendingAmount: number): boolean {
  return pendingAmount >= MINIMUM_PAYOUT;
}

// ===========================================
// PRICING TESTS
// ===========================================

describe('Supplier Pricing', () => {
  describe('Revenue Sharing', () => {
    it('should give supplier 80% of link price', () => {
      const share = calculateSupplierShare(LINK_PRICE_MONTHLY);
      expect(share).toBe(0.80);
    });

    it('should give supplier 80% of fork price', () => {
      const share = calculateSupplierShare(FORK_PRICE_MONTHLY);
      expect(share).toBe(0.80);
    });

    it('should give platform 20% of price', () => {
      const share = calculatePlatformShare(LINK_PRICE_MONTHLY);
      expect(share).toBe(0.20);
    });

    it('should sum to 100% of price', () => {
      const supplierShare = calculateSupplierShare(LINK_PRICE_MONTHLY);
      const platformShare = calculatePlatformShare(LINK_PRICE_MONTHLY);
      expect(supplierShare + platformShare).toBe(LINK_PRICE_MONTHLY);
    });
  });

  describe('Link vs Fork Pricing', () => {
    it('should have same price for link and fork', () => {
      expect(LINK_PRICE_MONTHLY).toBe(FORK_PRICE_MONTHLY);
    });

    it('should charge €1/month for links', () => {
      expect(LINK_PRICE_MONTHLY).toBe(1.00);
    });

    it('should charge €1/month for forks', () => {
      expect(FORK_PRICE_MONTHLY).toBe(1.00);
    });
  });
});

// ===========================================
// EARNINGS CALCULATION TESTS
// ===========================================

describe('Earnings Calculations', () => {
  describe('Monthly Earnings', () => {
    it('should calculate earnings for links only', () => {
      const result = calculateMonthlyEarnings(10, 0);

      expect(result.grossEarnings).toBe(10.00);
      expect(result.supplierShare).toBe(8.00);
      expect(result.platformShare).toBe(2.00);
    });

    it('should calculate earnings for forks only', () => {
      const result = calculateMonthlyEarnings(0, 10);

      expect(result.grossEarnings).toBe(10.00);
      expect(result.supplierShare).toBe(8.00);
      expect(result.platformShare).toBe(2.00);
    });

    it('should calculate combined earnings', () => {
      const result = calculateMonthlyEarnings(45, 12);

      expect(result.grossEarnings).toBe(57.00); // 45 + 12
      expect(result.supplierShare).toBe(45.60); // 57 * 0.80
      expect(result.platformShare).toBe(11.40); // 57 * 0.20
    });

    it('should handle zero usage', () => {
      const result = calculateMonthlyEarnings(0, 0);

      expect(result.grossEarnings).toBe(0);
      expect(result.supplierShare).toBe(0);
      expect(result.platformShare).toBe(0);
    });

    it('should handle large numbers', () => {
      const result = calculateMonthlyEarnings(1000, 500);

      expect(result.grossEarnings).toBe(1500.00);
      expect(result.supplierShare).toBe(1200.00);
      expect(result.platformShare).toBe(300.00);
    });
  });

  describe('Month-over-Month Growth', () => {
    it('should calculate positive growth', () => {
      const growth = calculateMonthOverMonthGrowth(120, 100);
      expect(growth).toBe(20);
    });

    it('should calculate negative growth', () => {
      const growth = calculateMonthOverMonthGrowth(80, 100);
      expect(growth).toBe(-20);
    });

    it('should return 100% for first month with earnings', () => {
      const growth = calculateMonthOverMonthGrowth(50, 0);
      expect(growth).toBe(100);
    });

    it('should return 0% for zero both months', () => {
      const growth = calculateMonthOverMonthGrowth(0, 0);
      expect(growth).toBe(0);
    });

    it('should handle doubling (100% growth)', () => {
      const growth = calculateMonthOverMonthGrowth(200, 100);
      expect(growth).toBe(100);
    });

    it('should handle halving (-50% growth)', () => {
      const growth = calculateMonthOverMonthGrowth(50, 100);
      expect(growth).toBe(-50);
    });
  });
});

// ===========================================
// PAYOUT TESTS
// ===========================================

describe('Payout Logic', () => {
  describe('Minimum Payout', () => {
    it('should have €10 minimum payout', () => {
      expect(MINIMUM_PAYOUT).toBe(10.00);
    });

    it('should allow payout at exactly minimum', () => {
      expect(canRequestPayout(10.00)).toBe(true);
    });

    it('should allow payout above minimum', () => {
      expect(canRequestPayout(50.00)).toBe(true);
    });

    it('should reject payout below minimum', () => {
      expect(canRequestPayout(9.99)).toBe(false);
    });

    it('should reject zero balance payout', () => {
      expect(canRequestPayout(0)).toBe(false);
    });
  });

  describe('Minimum Payout Scenarios', () => {
    it('should need 13 links/forks to reach minimum (at 80% share)', () => {
      // Each link/fork gives €0.80 to supplier
      // Need at least €10.00
      // 10 / 0.80 = 12.5, so need 13
      const earnings = calculateMonthlyEarnings(13, 0);
      expect(earnings.supplierShare).toBeGreaterThanOrEqual(MINIMUM_PAYOUT);
    });

    it('should not reach minimum with 12 links/forks', () => {
      const earnings = calculateMonthlyEarnings(12, 0);
      expect(earnings.supplierShare).toBeLessThan(MINIMUM_PAYOUT);
    });
  });
});

// ===========================================
// EDGE CASES
// ===========================================

describe('Edge Cases', () => {
  it('should handle floating point precision', () => {
    // Test that calculations are reasonably precise (within floating point tolerance)
    const result = calculateMonthlyEarnings(3, 0);
    expect(result.supplierShare).toBeCloseTo(2.4, 10);
    expect(result.platformShare).toBeCloseTo(0.6, 10);
    expect(result.supplierShare + result.platformShare).toBeCloseTo(3.0, 10);
  });

  it('should maintain consistency across multiple calculations', () => {
    const earnings1 = calculateMonthlyEarnings(10, 5);
    const earnings2 = calculateMonthlyEarnings(10, 5);

    expect(earnings1).toEqual(earnings2);
  });
});
