import { describe, expect, it } from 'vitest';
import { FileSchema } from '../file';

describe('FileSchema', () => {
  it('accepts Blob instances', () => {
    const schema = new FileSchema();
    const blob = new Blob(['hello'], { type: 'text/plain' });
    expect(schema.parse(blob)).toBe(blob);
  });

  it('rejects non-Blob values', () => {
    const schema = new FileSchema();
    expect(schema.safeParse('hello').success).toBe(false);
    expect(schema.safeParse(42).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});
