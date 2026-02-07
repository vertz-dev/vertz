import { describe, expect, it } from 'vitest';
import { NanoidSchema } from '../nanoid';

describe('NanoidSchema', () => {
  it('accepts valid nanoid format', () => {
    const schema = new NanoidSchema();
    expect(schema.parse('V1StGXR8_Z5jdHi6B-myT')).toBe('V1StGXR8_Z5jdHi6B-myT');
  });

  it('rejects invalid nanoid', () => {
    const schema = new NanoidSchema();
    expect(schema.safeParse('too-short').success).toBe(false);
    expect(schema.safeParse('V1StGXR8_Z5jdHi6B-myT!').success).toBe(false); // invalid char
  });
});
