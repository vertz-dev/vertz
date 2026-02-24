import { describe, expect, it } from 'bun:test';
import { CuidSchema } from '../cuid';

describe('CuidSchema', () => {
  it('accepts valid CUID format', () => {
    const schema = new CuidSchema();
    expect(schema.parse('cjld2cyuq0000t3rmniod1foy')).toBe('cjld2cyuq0000t3rmniod1foy');
  });

  it('rejects invalid CUID', () => {
    const schema = new CuidSchema();
    expect(schema.safeParse('not-a-cuid').success).toBe(false);
    expect(schema.safeParse('xjld2cyuq0000t3rmniod1foy').success).toBe(false); // wrong prefix
  });
});
