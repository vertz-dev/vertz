import { describe, expect, it } from 'bun:test';
import { UlidSchema } from '../ulid';

describe('UlidSchema', () => {
  it('accepts valid ULID format', () => {
    const schema = new UlidSchema();
    expect(schema.parse('01ARZ3NDEKTSV4RRFFQ69G5FAV').data).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  it('rejects invalid ULID', () => {
    const schema = new UlidSchema();
    expect(schema.safeParse('not-a-ulid').ok).toBe(false);
    expect(schema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FA').ok).toBe(false); // too short
  });
});
