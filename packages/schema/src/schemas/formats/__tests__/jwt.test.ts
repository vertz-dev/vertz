import { describe, expect, it } from 'vitest';
import { JwtSchema } from '../jwt';

describe('JwtSchema', () => {
  it('accepts valid JWT format', () => {
    const schema = new JwtSchema();
    const token =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(schema.parse(token)).toBe(token);
  });

  it('rejects invalid JWT', () => {
    const schema = new JwtSchema();
    expect(schema.safeParse('not.a.jwt!').success).toBe(false);
    expect(schema.safeParse('only-one-part').success).toBe(false);
    expect(schema.safeParse('two.parts').success).toBe(false);
  });
});
