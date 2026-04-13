import { describe, it } from '@vertz/test';
import { d } from '@vertz/db';
import { entity } from '../../entity';
import { service } from '../../service/service';
import { domain } from '../index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text(),
});
const usersModel = d.model(usersTable);
const usersEntity = entity('users', { model: usersModel });

const paymentsService = service('payments', {
  actions: {
    charge: {
      response: { parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }) },
      handler: async () => ({ ok: true }),
    },
  },
});

// ---------------------------------------------------------------------------
// Positive type tests
// ---------------------------------------------------------------------------

describe('domain() type safety', () => {
  it('accepts EntityDefinition in entities array', () => {
    domain('billing', { entities: [usersEntity] });
  });

  it('accepts ServiceDefinition in services array', () => {
    domain('billing', { services: [paymentsService] });
  });

  it('accepts both entities and services', () => {
    domain('billing', {
      entities: [usersEntity],
      services: [paymentsService],
    });
  });

  // ---------------------------------------------------------------------------
  // Negative type tests
  // ---------------------------------------------------------------------------

  it('rejects ServiceDefinition in entities array', () => {
    // @ts-expect-error — ServiceDefinition is not assignable to EntityDefinition[]
    domain('billing', { entities: [paymentsService] });
  });

  it('rejects EntityDefinition in services array', () => {
    // @ts-expect-error — EntityDefinition is not assignable to ServiceDefinition[]
    domain('billing', { services: [usersEntity] });
  });
});
