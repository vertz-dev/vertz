import { describe, expect, it } from '@vertz/test';
import { CuidSchema } from '../cuid';

describe('CuidSchema', () => {
  it('accepts valid CUID format', () => {
    const schema = new CuidSchema();
    expect(schema.parse('cjld2cyuq0000t3rmniod1foy').data).toBe('cjld2cyuq0000t3rmniod1foy');
  });

  it('rejects invalid CUID', () => {
    const schema = new CuidSchema();
    expect(schema.safeParse('not-a-cuid').ok).toBe(false);
    expect(schema.safeParse('xjld2cyuq0000t3rmniod1foy').ok).toBe(false); // wrong prefix
  });

  it('toJSONSchema returns base string type (no extra format)', () => {
    expect(new CuidSchema().toJSONSchema()).toEqual({ type: 'string' });
  });
});
