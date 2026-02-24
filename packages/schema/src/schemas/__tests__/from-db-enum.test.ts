import { describe, expect, it } from 'bun:test';
import { s } from '../../index';
import { EnumSchema } from '../enum';

describe('s.fromDbEnum', () => {
  it('creates an EnumSchema from a db column with enum metadata', () => {
    // Simulate a db column builder with _meta containing enumValues
    const dbColumn = {
      _meta: {
        sqlType: 'enum',
        enumName: 'task_status',
        enumValues: ['todo', 'in_progress', 'done'] as const,
        primary: false,
        unique: false,
        nullable: false,
        hasDefault: false,
        sensitive: false,
        hidden: false,
        isTenant: false,
        references: null,
        check: null,
      },
    };

    const schema = s.fromDbEnum(dbColumn);
    expect(schema).toBeInstanceOf(EnumSchema);
    expect(schema.parse('todo')).toBe('todo');
    expect(schema.parse('in_progress')).toBe('in_progress');
    expect(schema.parse('done')).toBe('done');
  });

  it('rejects values not in the db enum', () => {
    const dbColumn = {
      _meta: {
        sqlType: 'enum',
        enumName: 'priority',
        enumValues: ['low', 'medium', 'high'] as const,
        primary: false,
        unique: false,
        nullable: false,
        hasDefault: false,
        sensitive: false,
        hidden: false,
        isTenant: false,
        references: null,
        check: null,
      },
    };

    const schema = s.fromDbEnum(dbColumn);
    const result = schema.safeParse('critical');
    expect(result.success).toBe(false);
  });

  it('throws when column has no enumValues', () => {
    const dbColumn = {
      _meta: {
        sqlType: 'text',
        primary: false,
        unique: false,
        nullable: false,
        hasDefault: false,
        sensitive: false,
        hidden: false,
        isTenant: false,
        references: null,
        check: null,
      },
    };

    expect(() => s.fromDbEnum(dbColumn)).toThrow('not an enum column');
  });

  it('preserves type narrowing from db enum values', () => {
    const dbColumn = {
      _meta: {
        sqlType: 'enum',
        enumName: 'status',
        enumValues: ['active', 'inactive'] as const,
        primary: false,
        unique: false,
        nullable: false,
        hasDefault: false,
        sensitive: false,
        hidden: false,
        isTenant: false,
        references: null,
        check: null,
      },
    };

    const schema = s.fromDbEnum(dbColumn);
    // Should work with extract/exclude just like regular enum
    const activeOnly = schema.extract(['active']);
    expect(activeOnly.parse('active')).toBe('active');
    expect(activeOnly.safeParse('inactive').success).toBe(false);
  });
});
