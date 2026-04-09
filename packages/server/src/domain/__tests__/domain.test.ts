import { describe, expect, it } from '@vertz/test';
import { createMiddleware } from '@vertz/core';
import { d } from '@vertz/db';
import { entity } from '../../entity';
import { service } from '../../service/service';
import { domain } from '../index';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text(),
  name: d.text(),
});
const usersModel = d.model(usersTable);

const invoicesTable = d.table('invoices', {
  id: d.uuid().primary(),
  amount: d.integer(),
});
const invoicesModel = d.model(invoicesTable);

const usersEntity = entity('users', { model: usersModel });
const invoicesEntity = entity('invoices', { model: invoicesModel });

const paymentsService = service('payments', {
  actions: {
    charge: {
      response: { parse: (v: unknown) => v as { ok: boolean } },
      handler: async () => ({ ok: true }),
    },
  },
});

const testMiddleware = createMiddleware({
  name: 'rate-limit',
  handler: async () => ({}),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: domain() builder', () => {
  describe('Given valid config with entities and services', () => {
    it('Then returns a frozen DomainDefinition with kind "domain"', () => {
      const def = domain('billing', {
        entities: [invoicesEntity],
        services: [paymentsService],
      });

      expect(def.kind).toBe('domain');
      expect(Object.isFrozen(def)).toBe(true);
    });

    it('Then stores the name "billing"', () => {
      const def = domain('billing', {
        entities: [invoicesEntity],
        services: [paymentsService],
      });

      expect(def.name).toBe('billing');
    });

    it('Then stores entities array', () => {
      const def = domain('billing', {
        entities: [invoicesEntity],
        services: [paymentsService],
      });

      expect(def.entities).toEqual([invoicesEntity]);
    });

    it('Then stores services array', () => {
      const def = domain('billing', {
        entities: [invoicesEntity],
        services: [paymentsService],
      });

      expect(def.services).toEqual([paymentsService]);
    });

    it('Then stores middleware array (empty if not provided)', () => {
      const def = domain('billing', {
        entities: [invoicesEntity],
      });

      expect(def.middleware).toEqual([]);
    });
  });

  describe('Given an invalid name', () => {
    it('Then throws for empty string', () => {
      expect(() => domain('', { entities: [invoicesEntity] })).toThrow(
        /domain\(\) name must be a non-empty lowercase string/,
      );
    });

    it('Then throws for uppercase names', () => {
      expect(() => domain('Billing', { entities: [invoicesEntity] })).toThrow(/domain\(\) name/);
    });

    it('Then throws for names with slashes', () => {
      expect(() => domain('billing/api', { entities: [invoicesEntity] })).toThrow(
        /domain\(\) name/,
      );
    });

    it('Then throws for names starting with a number', () => {
      expect(() => domain('1billing', { entities: [invoicesEntity] })).toThrow(/domain\(\) name/);
    });
  });

  describe('Given empty config (no entities, no services)', () => {
    it('Then throws requiring at least one entity or service', () => {
      expect(() => domain('billing', {})).toThrow(
        /domain\(\) must have at least one entity or service/,
      );
    });
  });

  describe('Given config with only entities', () => {
    it('Then returns definition with empty services array', () => {
      const def = domain('billing', { entities: [invoicesEntity] });

      expect(def.services).toEqual([]);
    });
  });

  describe('Given config with only services', () => {
    it('Then returns definition with empty entities array', () => {
      const def = domain('payments', { services: [paymentsService] });

      expect(def.entities).toEqual([]);
    });
  });

  describe('Given config with middleware', () => {
    it('Then stores middleware in the definition', () => {
      const def = domain('billing', {
        entities: [invoicesEntity],
        middleware: [testMiddleware],
      });

      expect(def.middleware).toEqual([testMiddleware]);
    });
  });

  describe('Given valid domain names', () => {
    it('Then accepts simple lowercase names', () => {
      expect(() => domain('billing', { entities: [invoicesEntity] })).not.toThrow();
    });

    it('Then accepts names with hyphens', () => {
      expect(() => domain('user-management', { entities: [usersEntity] })).not.toThrow();
    });

    it('Then accepts names with numbers', () => {
      expect(() => domain('billing2', { entities: [invoicesEntity] })).not.toThrow();
    });

    it('Then accepts versioned names', () => {
      expect(() => domain('v2-billing', { entities: [invoicesEntity] })).not.toThrow();
    });
  });
});
