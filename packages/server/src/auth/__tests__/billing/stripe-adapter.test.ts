import { describe, expect, it } from 'bun:test';
import { createStripeBillingAdapter } from '../../billing/stripe-adapter';

/**
 * Mock Stripe client — tracks API calls without hitting real Stripe.
 */
function createMockStripe() {
  const products: Array<{ id: string; name: string; metadata: Record<string, string> }> = [];
  const prices: Array<{
    id: string;
    product: string;
    unit_amount: number;
    recurring: { interval: string; interval_count?: number } | null;
    active: boolean;
    metadata: Record<string, string>;
  }> = [];
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    products: {
      list: async () => {
        calls.push({ method: 'products.list', args: [] });
        return { data: products };
      },
      create: async (params: {
        name: string;
        metadata: Record<string, string>;
        description?: string;
      }) => {
        calls.push({ method: 'products.create', args: [params] });
        const product = {
          id: `prod_${products.length + 1}`,
          name: params.name,
          metadata: params.metadata,
        };
        products.push(product);
        return product;
      },
      update: async (id: string, params: { name?: string; metadata?: Record<string, string> }) => {
        calls.push({ method: 'products.update', args: [id, params] });
        const product = products.find((p) => p.id === id);
        if (product && params.name) product.name = params.name;
        if (product && params.metadata)
          product.metadata = { ...product.metadata, ...params.metadata };
        return product;
      },
    },
    prices: {
      list: async (params: { product: string }) => {
        calls.push({ method: 'prices.list', args: [params] });
        return { data: prices.filter((p) => p.product === params.product) };
      },
      create: async (params: {
        product: string;
        unit_amount: number;
        currency: string;
        recurring?: { interval: string; interval_count?: number };
        metadata: Record<string, string>;
      }) => {
        calls.push({ method: 'prices.create', args: [params] });
        const price = {
          id: `price_${prices.length + 1}`,
          product: params.product,
          unit_amount: params.unit_amount,
          recurring: params.recurring ?? null,
          active: true,
          metadata: params.metadata,
        };
        prices.push(price);
        return price;
      },
      update: async (id: string, params: { active: boolean }) => {
        calls.push({ method: 'prices.update', args: [id, params] });
        const price = prices.find((p) => p.id === id);
        if (price) price.active = params.active;
        return price;
      },
    },
    _products: products,
    _prices: prices,
    _calls: calls,
  };
}

describe('Feature: Stripe billing adapter', () => {
  describe('Given plans to sync', () => {
    it('creates Stripe Products for each plan', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      await adapter.syncPlans({
        pro_monthly: {
          title: 'Pro',
          group: 'main',
          price: { amount: 29, interval: 'month' as const },
          features: ['doc:edit'],
        },
      });

      expect(stripe._products).toHaveLength(1);
      expect(stripe._products[0].name).toBe('Pro');
      expect(stripe._products[0].metadata.vertzPlanId).toBe('pro_monthly');
    });

    it('creates Stripe Prices with correct amounts and intervals', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      await adapter.syncPlans({
        pro_monthly: {
          title: 'Pro',
          group: 'main',
          price: { amount: 29, interval: 'month' as const },
          features: ['doc:edit'],
        },
      });

      expect(stripe._prices).toHaveLength(1);
      expect(stripe._prices[0].unit_amount).toBe(2900); // $29 in cents
      expect(stripe._prices[0].recurring).toEqual({ interval: 'month' });
    });

    it('is idempotent — running twice produces same result', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      const plans = {
        pro_monthly: {
          title: 'Pro',
          group: 'main',
          price: { amount: 29, interval: 'month' as const },
          features: ['doc:edit'],
        },
      };

      await adapter.syncPlans(plans);
      await adapter.syncPlans(plans);

      // Should still have only 1 product and 1 price
      expect(stripe._products).toHaveLength(1);
      expect(stripe._prices).toHaveLength(1);
    });

    it('stores plan group in Product metadata', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      await adapter.syncPlans({
        pro_monthly: {
          title: 'Pro',
          group: 'main',
          price: { amount: 29, interval: 'month' as const },
          features: ['doc:edit'],
        },
      });

      expect(stripe._products[0].metadata.group).toBe('main');
    });

    it('marks add-on plans with addOn: true in metadata', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      await adapter.syncPlans({
        export_addon: {
          title: 'Export Add-on',
          addOn: true,
          price: { amount: 15, interval: 'month' as const },
          features: ['project:export'],
        },
      });

      expect(stripe._products[0].metadata.addOn).toBe('true');
    });

    it('creates $0 Price for free plans', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      await adapter.syncPlans({
        free: {
          title: 'Free',
          group: 'main',
          features: ['doc:view'],
        },
      });

      expect(stripe._prices).toHaveLength(1);
      expect(stripe._prices[0].unit_amount).toBe(0);
    });
  });

  describe('Given a plan with quarterly interval', () => {
    it('passes interval_count: 3 to Stripe for quarterly plans', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      await adapter.syncPlans({
        pro_quarterly: {
          title: 'Pro Quarterly',
          group: 'main',
          price: { amount: 79, interval: 'quarter' as const },
          features: ['doc:edit'],
        },
      });

      expect(stripe._prices).toHaveLength(1);
      expect(stripe._prices[0].recurring).toEqual({
        interval: 'month',
        interval_count: 3,
      });

      // Verify the raw call args passed to prices.create
      const createCall = stripe._calls.find((c) => c.method === 'prices.create');
      expect((createCall?.args[0] as { recurring: unknown }).recurring).toEqual({
        interval: 'month',
        interval_count: 3,
      });
    });
  });

  describe('Given a plan with yearly interval', () => {
    it('maps year to { interval: "year" } without interval_count', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      await adapter.syncPlans({
        pro_yearly: {
          title: 'Pro Yearly',
          group: 'main',
          price: { amount: 290, interval: 'year' as const },
          features: ['doc:edit'],
        },
      });

      expect(stripe._prices).toHaveLength(1);
      expect(stripe._prices[0].recurring).toEqual({ interval: 'year' });
    });
  });

  describe('Given placeholder methods', () => {
    it('createSubscription returns placeholder string', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      const subId = await adapter.createSubscription('tenant-1', 'pro');
      expect(subId).toBe('sub_placeholder');
    });

    it('reportOverage resolves without error', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      await expect(adapter.reportOverage('tenant-1', 'api-calls', 100)).resolves.toBeUndefined();
    });
  });

  describe('Given a plan version changes', () => {
    it('creates new Price and archives old Price', async () => {
      const stripe = createMockStripe();
      const adapter = createStripeBillingAdapter({ stripe });

      // First sync — $29/month
      await adapter.syncPlans({
        pro_monthly: {
          title: 'Pro',
          group: 'main',
          price: { amount: 29, interval: 'month' as const },
          features: ['doc:edit'],
        },
      });

      expect(stripe._prices).toHaveLength(1);
      expect(stripe._prices[0].active).toBe(true);

      // Second sync — $39/month (price changed)
      await adapter.syncPlans({
        pro_monthly: {
          title: 'Pro',
          group: 'main',
          price: { amount: 39, interval: 'month' as const },
          features: ['doc:edit'],
        },
      });

      expect(stripe._prices).toHaveLength(2);
      expect(stripe._prices[0].active).toBe(false); // Old price archived
      expect(stripe._prices[1].active).toBe(true);
      expect(stripe._prices[1].unit_amount).toBe(3900);
    });
  });
});
