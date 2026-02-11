import { describe, expect, it } from 'vitest';
import { mapRow, mapRows } from '../row-mapper';

describe('row-mapper', () => {
  describe('mapRow', () => {
    it('converts snake_case keys to camelCase', () => {
      const row = { first_name: 'Alice', last_name: 'Smith', id: 1 };
      const result = mapRow<Record<string, unknown>>(row);
      expect(result).toEqual({ firstName: 'Alice', lastName: 'Smith', id: 1 });
    });

    it('handles already camelCase keys', () => {
      const row = { name: 'Alice', email: 'alice@test.com' };
      const result = mapRow<Record<string, unknown>>(row);
      expect(result).toEqual({ name: 'Alice', email: 'alice@test.com' });
    });

    it('preserves null and undefined values', () => {
      const row = { first_name: null, age: undefined };
      const result = mapRow<Record<string, unknown>>(row);
      expect(result).toEqual({ firstName: null, age: undefined });
    });

    it('does not deeply transform JSONB objects', () => {
      const row = { metadata: { some_key: 'value' } };
      const result = mapRow<Record<string, unknown>>(row);
      expect(result.metadata).toEqual({ some_key: 'value' });
    });
  });

  describe('mapRows', () => {
    it('converts an array of rows', () => {
      const rows = [
        { first_name: 'Alice', id: 1 },
        { first_name: 'Bob', id: 2 },
      ];
      const result = mapRows<Record<string, unknown>>(rows);
      expect(result).toEqual([
        { firstName: 'Alice', id: 1 },
        { firstName: 'Bob', id: 2 },
      ]);
    });

    it('returns empty array for empty input', () => {
      const result = mapRows<Record<string, unknown>>([]);
      expect(result).toEqual([]);
    });
  });
});
