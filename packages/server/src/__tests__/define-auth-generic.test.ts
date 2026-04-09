import { describe, expect, it } from '@vertz/test';
import { defineAuth } from '../define-auth';

describe('defineAuth()', () => {
  it('returns the config object unchanged (identity function)', () => {
    const config = { session: { strategy: 'jwt' as const, ttl: '1h' } };
    const result = defineAuth(config);
    expect(result).toBe(config);
  });

  it('preserves tenant config when provided', () => {
    const config = defineAuth({
      session: { strategy: 'jwt', ttl: '1h' },
      tenant: {
        verifyMembership: async () => true,
        multiLevel: true,
      },
    });
    expect(config.tenant).toBeDefined();
    expect((config.tenant as { multiLevel?: boolean }).multiLevel).toBe(true);
  });
});
