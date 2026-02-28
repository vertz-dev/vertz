import { describe, expect, it } from 'bun:test';
import { FileSchema } from '../file';

describe('FileSchema', () => {
  it('accepts Blob instances', () => {
    const schema = new FileSchema();
    const blob = new Blob(['hello'], { type: 'text/plain' });
    expect(schema.parse(blob).data).toBe(blob);
  });

  it('rejects non-Blob values', () => {
    const schema = new FileSchema();
    expect(schema.safeParse('hello').ok).toBe(false);
    expect(schema.safeParse(42).ok).toBe(false);
    expect(schema.safeParse({}).ok).toBe(false);
  });
});
