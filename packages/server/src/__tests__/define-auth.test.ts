import { describe, expect, it } from '@vertz/test';
import type { AuthConfig } from '../auth/types';
import type { EntityDefinition } from '../entity/types';
import { defineAuth, defineEntities } from '../index';

describe('defineAuth', () => {
  it('returns the same config object it receives', () => {
    const config = {
      session: { strategy: 'jwt' as const, ttl: '15m' },
      emailPassword: { enabled: true },
      jwtSecret: 'test-secret-that-is-at-least-32-chars!!',
    };

    const result = defineAuth(config);

    expect(result).toBe(config);
  });

  it('result is assignable to AuthConfig', () => {
    const result = defineAuth({
      session: { strategy: 'jwt', ttl: '15m' },
    });

    // Prove the return type satisfies AuthConfig
    const _check: AuthConfig = result;
    expect(_check).toBe(result);
  });
});

describe('defineEntities', () => {
  it('returns the same array it receives', () => {
    const entities: EntityDefinition[] = [];
    const result = defineEntities(entities);

    expect(result).toBe(entities);
  });

  it('result is assignable to EntityDefinition[]', () => {
    const result = defineEntities([]);
    const _check: EntityDefinition[] = result;
    expect(_check).toBe(result);
  });
});
