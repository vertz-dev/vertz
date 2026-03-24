import { describe, expect, it } from 'bun:test';
import { createMiddleware } from '@vertz/core';
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

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});
const usersModel = d.model(usersTable);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: domain middleware', () => {
  describe('Given a domain with middleware', () => {
    // Middleware that sets a header on the response via context
    const domainMiddleware = createMiddleware({
      name: 'domain-tracker',
      handler: async () => ({ _domainTracked: true }),
    });

    const invoices = entity('invoices', {
      model: invoicesModel,
      access: { list: () => true },
    });
    const billing = domain('billing', {
      entities: [invoices],
      middleware: [domainMiddleware],
    });

    const users = entity('users', {
      model: usersModel,
      access: { list: () => true },
    });

    it('Then middleware runs for entity routes in the domain', async () => {
      let middlewareRan = false;
      const tracker = createMiddleware({
        name: 'tracker',
        handler: async () => {
          middlewareRan = true;
          return {};
        },
      });
      const inv = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const b = domain('billing', {
        entities: [inv],
        middleware: [tracker],
      });
      const app = createServer({ domains: [b] });

      await app.handler(new Request('http://localhost/api/billing/invoices'));
      expect(middlewareRan).toBe(true);
    });

    it('Then middleware runs for service routes in the domain', async () => {
      let middlewareRan = false;
      const tracker = createMiddleware({
        name: 'tracker',
        handler: async () => {
          middlewareRan = true;
          return {};
        },
      });
      const payments = service('payments', {
        access: { charge: () => true },
        actions: {
          charge: {
            response: { parse: (v: unknown) => v as { ok: boolean } },
            handler: async () => ({ ok: true }),
          },
        },
      });
      const b = domain('billing', {
        services: [payments],
        middleware: [tracker],
      });
      const app = createServer({ domains: [b] });

      await app.handler(
        new Request('http://localhost/api/billing/payments/charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      );
      expect(middlewareRan).toBe(true);
    });

    it('Then middleware does NOT run for routes outside the domain', async () => {
      let middlewareRan = false;
      const tracker = createMiddleware({
        name: 'tracker',
        handler: async () => {
          middlewareRan = true;
          return {};
        },
      });
      const inv = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const b = domain('billing', {
        entities: [inv],
        middleware: [tracker],
      });
      const usr = entity('users', {
        model: usersModel,
        access: { list: () => true },
      });
      const app = createServer({ domains: [b], entities: [usr] });

      middlewareRan = false;
      await app.handler(new Request('http://localhost/api/users'));
      expect(middlewareRan).toBe(false);
    });

    it('Then middleware runs AFTER global middleware', async () => {
      const order: string[] = [];
      const globalMw = createMiddleware({
        name: 'global',
        handler: async () => {
          order.push('global');
          return {};
        },
      });
      const domainMw = createMiddleware({
        name: 'domain',
        handler: async () => {
          order.push('domain');
          return {};
        },
      });
      const inv = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const b = domain('billing', {
        entities: [inv],
        middleware: [domainMw],
      });
      const app = createServer({ domains: [b] });
      app.middlewares([globalMw]);

      await app.handler(new Request('http://localhost/api/billing/invoices'));
      expect(order).toEqual(['global', 'domain']);
    });
  });

  describe('Given multiple domains with different middleware', () => {
    it('Then each domain runs only its own middleware', async () => {
      const billingRan: boolean[] = [];
      const projectsRan: boolean[] = [];

      const billingMw = createMiddleware({
        name: 'billing-mw',
        handler: async () => {
          billingRan.push(true);
          return {};
        },
      });
      const projectsMw = createMiddleware({
        name: 'projects-mw',
        handler: async () => {
          projectsRan.push(true);
          return {};
        },
      });

      const inv = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const usr = entity('users', {
        model: usersModel,
        access: { list: () => true },
      });
      const billing = domain('billing', { entities: [inv], middleware: [billingMw] });
      const projects = domain('projects', { entities: [usr], middleware: [projectsMw] });

      const app = createServer({ domains: [billing, projects] });

      await app.handler(new Request('http://localhost/api/billing/invoices'));
      expect(billingRan.length).toBe(1);
      expect(projectsRan.length).toBe(0);

      await app.handler(new Request('http://localhost/api/projects/users'));
      expect(billingRan.length).toBe(1);
      expect(projectsRan.length).toBe(1);
    });
  });

  describe('Given a domain with no middleware', () => {
    it('Then routes work normally with only global middleware', async () => {
      const inv = entity('invoices', {
        model: invoicesModel,
        access: { list: () => true },
      });
      const b = domain('billing', { entities: [inv] });
      const app = createServer({ domains: [b] });

      const res = await app.handler(new Request('http://localhost/api/billing/invoices'));
      expect(res.status).toBe(200);
    });
  });
});
