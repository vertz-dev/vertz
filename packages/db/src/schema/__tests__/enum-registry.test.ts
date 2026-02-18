import { describe, expect, it } from 'vitest';
import { d } from '../../d';
import { createEnumRegistry } from '../enum-registry';

describe('shared enum registry (Issue #182)', () => {
  it('registers an enum and retrieves it by name', () => {
    const enums = createEnumRegistry({
      status: ['active', 'inactive', 'pending'],
      role: ['admin', 'editor', 'viewer'],
    } as const);

    expect(enums.status.values).toEqual(['active', 'inactive', 'pending']);
    expect(enums.role.values).toEqual(['admin', 'editor', 'viewer']);
  });

  it('registered enums work with d.enum()', () => {
    const enums = createEnumRegistry({
      status: ['active', 'inactive'],
    } as const);

    const col = d.enum('status', enums.status);
    expect(col._meta.enumName).toBe('status');
    expect(col._meta.enumValues).toEqual(['active', 'inactive']);
  });

  it('same enum can be used across multiple tables', () => {
    const enums = createEnumRegistry({
      status: ['active', 'inactive'],
    } as const);

    const table1 = d.table('orders', {
      id: d.uuid().primary(),
      status: d.enum('status', enums.status),
    });

    const table2 = d.table('subscriptions', {
      id: d.uuid().primary(),
      status: d.enum('status', enums.status),
    });

    // Both tables reference the same enum values
    expect(table1._columns.status._meta.enumValues).toBe(
      table2._columns.subscriptions_status?._meta?.enumValues ??
        table2._columns.status._meta.enumValues,
    );
  });
});
