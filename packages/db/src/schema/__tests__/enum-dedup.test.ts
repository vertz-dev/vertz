import { describe, expect, it } from 'bun:test';
import { EnumSchema } from '../../../../schema/src/schemas/enum';
import { d } from '../../d';

describe('enum dedup — d.enum() accepts EnumSchema', () => {
  it('accepts an EnumSchema and derives values from it', () => {
    const statusSchema = new EnumSchema(['active', 'inactive', 'pending'] as const);
    const col = d.enum('status', statusSchema);
    expect(col._meta.sqlType).toBe('enum');
    expect(col._meta.enumName).toBe('status');
    expect(col._meta.enumValues).toEqual(['active', 'inactive', 'pending']);
  });

  it('still accepts raw string array', () => {
    const col = d.enum('role', ['admin', 'editor']);
    expect(col._meta.enumName).toBe('role');
    expect(col._meta.enumValues).toEqual(['admin', 'editor']);
  });
});
