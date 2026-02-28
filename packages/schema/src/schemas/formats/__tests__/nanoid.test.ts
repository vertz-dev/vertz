import { describe, expect, it } from 'bun:test';
import { NanoidSchema } from '../nanoid';

describe('NanoidSchema', () => {
  it('accepts valid nanoid format', () => {
    const schema = new NanoidSchema();
    expect(schema.parse('V1StGXR8_Z5jdHi6B-myT').data).toBe('V1StGXR8_Z5jdHi6B-myT');
  });

  it('rejects invalid nanoid', () => {
    const schema = new NanoidSchema();
    expect(schema.safeParse('too-short').ok).toBe(false);
    expect(schema.safeParse('V1StGXR8_Z5jdHi6B-myT!').ok).toBe(false); // invalid char
  });
});
