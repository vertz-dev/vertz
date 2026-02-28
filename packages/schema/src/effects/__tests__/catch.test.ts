import { describe, expect, it } from 'bun:test';
import { NumberSchema } from '../../schemas/number';
import { StringSchema } from '../../schemas/string';

describe('.catch()', () => {
  it('returns fallback value on parse failure', () => {
    const schema = new StringSchema().catch('default');
    expect(schema.parse(42).data).toBe('default');
  });

  it('calls fallback function on parse failure', () => {
    const schema = new NumberSchema().catch(() => 0);
    expect(schema.parse('not-a-number').data).toBe(0);
  });

  it('returns normal value on successful parse (fallback ignored)', () => {
    const schema = new StringSchema().catch('default');
    expect(schema.parse('hello').data).toBe('hello');
  });
});
