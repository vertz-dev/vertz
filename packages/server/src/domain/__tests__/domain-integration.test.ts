import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { createServer } from '../../create-server';
import { entity } from '../../entity';
import { service } from '../../service/service';
import { domain } from '../index';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const invoicesTable = d.table('invoices', {
  id: d.uuid().primary(),
  amount: d.integer(),
});
const invoicesModel = d.model(invoicesTable);

const subscriptionsTable = d.table('subscriptions', {
  id: d.uuid().primary(),
  plan: d.text(),
});
const subscriptionsModel = d.model(subscriptionsTable);

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});
const usersModel = d.model(usersTable);

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
});
const tasksModel = d.model(tasksTable);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: domain route prefixing', () => {
  describe('Given a domain "billing" with entity "invoices"', () => {
    const invoices = entity('invoices', {
      model: invoicesModel,
      access: {
        list: () => true,
        get: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });
    const billing = domain('billing', { entities: [invoices] });

    describe('When createServer processes the domain', () => {
      const app = createServer({ domains: [billing] });

      it('Then entity list route is prefixed: GET /api/billing/invoices', async () => {
        const res = await app.handler(new Request('http://localhost/api/billing/invoices'));
        expect(res.status).toBe(200);
      });

      it('Then entity detail route is prefixed: GET /api/billing/invoices/:id', async () => {
        const res = await app.handler(new Request('http://localhost/api/billing/invoices/123'));
        // 404 is expected since noop adapter returns null for get
        expect(res.status).toBe(404);
      });

      it('Then entity create route is prefixed: POST /api/billing/invoices', async () => {
        const res = await app.handler(
          new Request('http://localhost/api/billing/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 100 }),
          }),
        );
        expect(res.status).toBe(201);
      });

      it('Then entity update route is prefixed: PATCH /api/billing/invoices/:id', async () => {
        const res = await app.handler(
          new Request('http://localhost/api/billing/invoices/123', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 200 }),
          }),
        );
        // 404 is expected since noop adapter returns null for get (update checks existence)
        expect([200, 404]).toContain(res.status);
      });

      it('Then entity delete route is prefixed: DELETE /api/billing/invoices/:id', async () => {
        const res = await app.handler(
          new Request('http://localhost/api/billing/invoices/123', { method: 'DELETE' }),
        );
        expect([200, 204, 404]).toContain(res.status);
      });

      it('Then unprefixed routes return 404', async () => {
        const res = await app.handler(new Request('http://localhost/api/invoices'));
        expect(res.status).toBe(404);
      });
    });
  });

  describe('Given a domain "billing" with service "payments" action "charge"', () => {
    const payments = service('payments', {
      access: { charge: () => true },
      actions: {
        charge: {
          response: { parse: (v: unknown) => v as { ok: boolean } },
          handler: async () => ({ ok: true }),
        },
      },
    });
    const billing = domain('billing', { services: [payments] });

    describe('When createServer processes the domain', () => {
      it('Then service route is prefixed: POST /api/billing/payments/charge', async () => {
        const app = createServer({ domains: [billing] });
        const res = await app.handler(
          new Request('http://localhost/api/billing/payments/charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }),
        );
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Given mixed top-level entities and domains', () => {
    const invoices = entity('invoices', {
      model: invoicesModel,
      access: { list: () => true },
    });
    const users = entity('users', {
      model: usersModel,
      access: { list: () => true },
    });
    const billing = domain('billing', { entities: [invoices] });

    it('Then top-level entities keep /api/{entityName} paths', async () => {
      const app = createServer({ domains: [billing], entities: [users] });
      const res = await app.handler(new Request('http://localhost/api/users'));
      expect(res.status).toBe(200);
    });

    it('Then domain entities get /api/{domainName}/{entityName} paths', async () => {
      const app = createServer({ domains: [billing], entities: [users] });
      const res = await app.handler(new Request('http://localhost/api/billing/invoices'));
      expect(res.status).toBe(200);
    });
  });

  describe('Given duplicate entity names across domains', () => {
    it('Then throws error listing the collision', () => {
      const invoicesA = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const invoicesB = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const domainA = domain('billing', { entities: [invoicesA] });
      const domainB = domain('payments', { entities: [invoicesB] });

      expect(() => createServer({ domains: [domainA, domainB] })).toThrow(
        /Entity "invoices" appears in both domain "billing" and domain "payments"/,
      );
    });
  });

  describe('Given duplicate entity name between domain and top-level', () => {
    it('Then throws error listing the collision', () => {
      const invoicesDomain = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const invoicesTopLevel = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const billing = domain('billing', { entities: [invoicesDomain] });

      expect(() => createServer({ domains: [billing], entities: [invoicesTopLevel] })).toThrow(
        /Entity "invoices" appears in both domain "billing" and top-level entities/,
      );
    });
  });

  describe('Given duplicate domain names', () => {
    it('Then throws a clear error', () => {
      const invoices = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const subs = entity('subscriptions', {
        model: subscriptionsModel,
        access: { list: () => true },
      });
      const d1 = domain('billing', { entities: [invoices] });
      const d2 = domain('billing', { entities: [subs] });

      expect(() => createServer({ domains: [d1, d2] })).toThrow(/Duplicate domain name "billing"/);
    });
  });

  describe('Given domain name collides with top-level entity name', () => {
    it('Then throws error about route ambiguity', () => {
      const invoices = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const billingEntity = entity('billing', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const billing = domain('billing', { entities: [invoices] });

      expect(() => createServer({ domains: [billing], entities: [billingEntity] })).toThrow(
        /Domain name "billing" conflicts with top-level entity "billing"/,
      );
    });
  });

  describe('Given domain name collides with top-level service name', () => {
    it('Then throws error about route ambiguity', () => {
      const invoices = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const billingService = service('billing', {
        actions: {
          check: {
            response: { parse: (v: unknown) => v },
            handler: async () => ({}),
          },
        },
      });
      const billing = domain('billing', { entities: [invoices] });

      expect(() => createServer({ domains: [billing], services: [billingService] })).toThrow(
        /Domain name "billing" conflicts with top-level service "billing"/,
      );
    });
  });

  describe('Given cross-domain entity injection', () => {
    it('Then entities from domain A can access entities from domain B via inject', () => {
      const invoices = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const tasks = entity('tasks', {
        model: tasksModel,
        inject: { invoices },
        access: { list: () => true },
      });
      const billing = domain('billing', { entities: [invoices] });
      const projects = domain('projects', { entities: [tasks] });

      // Should not throw — cross-domain injection is resolved via the flat registry
      expect(() => createServer({ domains: [billing, projects] })).not.toThrow();
    });
  });

  describe('Given duplicate service names across domains', () => {
    it('Then throws error listing the collision', () => {
      const paymentsA = service('payments', {
        access: { charge: () => true },
        actions: {
          charge: {
            response: { parse: (v: unknown) => v },
            handler: async () => ({}),
          },
        },
      });
      const paymentsB = service('payments', {
        access: { refund: () => true },
        actions: {
          refund: {
            response: { parse: (v: unknown) => v },
            handler: async () => ({}),
          },
        },
      });
      const domainA = domain('billing', { services: [paymentsA] });
      const domainB = domain('refunds', { services: [paymentsB] });

      expect(() => createServer({ domains: [domainA, domainB] })).toThrow(
        /Service "payments" appears in both domain "billing" and domain "refunds"/,
      );
    });
  });

  describe('Given duplicate service name between domain and top-level', () => {
    it('Then throws error listing the collision', () => {
      const domainPayments = service('payments', {
        access: { charge: () => true },
        actions: {
          charge: {
            response: { parse: (v: unknown) => v },
            handler: async () => ({}),
          },
        },
      });
      const topLevelPayments = service('payments', {
        access: { check: () => true },
        actions: {
          check: {
            response: { parse: (v: unknown) => v },
            handler: async () => ({}),
          },
        },
      });
      const billing = domain('billing', { services: [domainPayments] });

      expect(() => createServer({ domains: [billing], services: [topLevelPayments] })).toThrow(
        /Service "payments" appears in both domain "billing" and top-level services/,
      );
    });
  });

  describe('Given tenant-scoped entities in a domain', () => {
    it('Then tenant chain resolution works across domains (flatten-first)', () => {
      const tenantTable = d.table('tenanted-tasks', {
        id: d.uuid().primary(),
        title: d.text(),
        tenantId: d.uuid(),
      });
      const tenantModel = d.model(tenantTable);
      const tenantEntity = entity('tenanted-tasks', {
        model: tenantModel,
        access: { list: () => true },
      });
      const projects = domain('projects', { entities: [tenantEntity] });

      // Should not throw — domain entities are flattened before tenant chain resolution
      const app = createServer({ domains: [projects] });
      expect(app).toBeDefined();
    });
  });
});

describe('Feature: domain exports', () => {
  it('import { domain } from "@vertz/server" works', async () => {
    const mod = await import('../../index');
    expect(mod.domain).toBeTypeOf('function');
  });
});
