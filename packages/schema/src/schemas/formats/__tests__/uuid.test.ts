import { describe, it, expect } from 'vitest';
import { UuidSchema } from '../uuid';

describe('UuidSchema', () => {
  it('accepts valid UUIDs', () => {
    const schema = new UuidSchema();
    expect(schema.parse('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(schema.parse('F47AC10B-58CC-4372-A567-0E02B2C3D479')).toBe(
      'F47AC10B-58CC-4372-A567-0E02B2C3D479',
    );
  });

  it('rejects invalid UUIDs', () => {
    const schema = new UuidSchema();
    expect(schema.safeParse('not-a-uuid').success).toBe(false);
    expect(schema.safeParse('550e8400-e29b-41d4-a716').success).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new UuidSchema().toJSONSchema()).toEqual({ type: 'string', format: 'uuid' });
  });
});
