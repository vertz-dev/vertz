// Domain Definition Tests
// Tests that domain() returns a valid DomainDefinition with correct type, fields, and expose config
import { describe, expect, it } from 'vitest';
import { d } from '@vertz/db';
import { domain } from '@vertz/server';

// Helper types for test scenarios
import { usersTable, orgsTable, postsTable } from "./fixtures";
import type { TableEntry } from '@vertz/db';
import type { DomainDefinition, DomainType, DomainOptions } from '@vertz/server';

// ---------------------------------------------------------------------------
// domain() Function Tests
// ---------------------------------------------------------------------------

describe('domain() - core function', () => {
  it('should be a function', () => {
    expect(domain).toBeTypeOf('function');
  });

  it('should require a name parameter', () => {
    // @ts-expect-error - domain requires name as first argument
    domain();
  });

  it('should require options as second argument', () => {
    // @ts-expect-error - domain requires options
    domain('users');
  });
});

describe('domain() - DomainDefinition return type', () => {
  it('should return an object with name property', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
    });
    
    expect(User).toHaveProperty('name');
    expect(User.name).toBe('users');
  });

  it('should return an object with type property', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
    });
    
    expect(User).toHaveProperty('type');
    expect(User.type).toBe('persisted');
  });

  it('should return an object with table property', () => {
    const entry = d.entry(usersTable);
    const User = domain('users', {
      type: 'persisted',
      table: entry,
    });
    
    expect(User).toHaveProperty('table');
    expect(User.table).toBe(entry);
  });

  it('should return an object with exposedRelations property', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
    });
    
    expect(User).toHaveProperty('exposedRelations');
    expect(typeof User.exposedRelations).toBe('object');
  });

  it('should return an object with access property', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => true,
      },
    });
    
    expect(User).toHaveProperty('access');
    expect(User.access).toHaveProperty('read');
  });

  it('should return an object with handlers property', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      handlers: {
        create: async () => ({}),
      },
    });
    
    expect(User).toHaveProperty('handlers');
  });

  it('should return an object with actions property', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      actions: {
        resetPassword: async () => ({ ok: true, data: {} }),
      },
    });
    
    expect(User).toHaveProperty('actions');
  });
});

describe('domain() - type field validation', () => {
  it('should accept persisted type', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
    });
    
    expect(User.type).toBe('persisted');
  });

  it('should accept process type', () => {
    const Process = domain('onboarding', {
      type: 'process',
      table: d.entry(usersTable), // process type can reference any table for now
    });
    
    expect(Process.type).toBe('process');
  });

  it('should accept view type', () => {
    const View = domain('user_stats', {
      type: 'view',
      table: d.entry(usersTable),
    });
    
    expect(View.type).toBe('view');
  });

  it('should accept session type', () => {
    const Session = domain('auth_session', {
      type: 'session',
      table: d.entry(usersTable),
    });
    
    expect(Session.type).toBe('session');
  });

  it('should reject invalid type', () => {
    // @ts-expect-error - invalid type should be rejected
    domain('users', {
      type: 'invalid',
      table: d.entry(usersTable),
    });
  });

  it('should require type field', () => {
    // @ts-expect-error - type is required
    domain('users', {
      table: d.entry(usersTable),
    });
  });
});

describe('domain() - fields configuration', () => {
  it('should accept fields with select configuration', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      fields: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    });
    
    expect(User).toHaveProperty('table');
  });

  it('should allow omitting fields (uses default exposure)', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
    });
    
    expect(User).toBeDefined();
  });
});

describe('domain() - expose configuration', () => {
  it('should accept expose with true for full relation exposure', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      expose: {
        organization: true,
        posts: true,
      },
    });
    
    expect(User.exposedRelations.organization).toBe(true);
    expect(User.exposedRelations.posts).toBe(true);
  });

  it('should accept expose with select for partial relation exposure', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      expose: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });
    
    expect(User.exposedRelations.organization).toEqual({ select: { id: true, name: true } });
  });

  it('should accept empty expose object (no relations)', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      expose: {},
    });
    
    expect(Object.keys(User.exposedRelations)).toHaveLength(0);
  });

  it('should default to empty exposedRelations when expose is omitted', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
    });
    
    expect(User.exposedRelations).toEqual({});
  });
});

describe('domain() - access rules', () => {
  it('should accept read access rule', () => {
    const accessRule = (row: any, ctx: any) => row.orgId === ctx.tenant?.id;
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: accessRule,
      },
    });
    
    expect(User.access.read).toBe(accessRule);
  });

  it('should accept create access rule', () => {
    const createRule = (data: any, ctx: any) => ctx.user?.role === 'admin';
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        create: createRule,
      },
    });
    
    expect(User.access.create).toBe(createRule);
  });

  it('should accept update access rule', () => {
    const updateRule = (row: any, ctx: any) => row.id === ctx.user?.id;
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        update: updateRule,
      },
    });
    
    expect(User.access.update).toBe(updateRule);
  });

  it('should accept delete access rule', () => {
    const deleteRule = (row: any, ctx: any) => ctx.user?.role === 'admin';
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        delete: deleteRule,
      },
    });
    
    expect(User.access.delete).toBe(deleteRule);
  });

  it('should accept all access rules together', () => {
    const rules = {
      read: (row: any, ctx: any) => true,
      create: (data: any, ctx: any) => true,
      update: (row: any, ctx: any) => true,
      delete: (row: any, ctx: any) => false,
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: rules,
    });
    
    expect(User.access).toEqual(rules);
  });
});

describe('domain() - handler overrides', () => {
  it('should accept list handler override', () => {
    const listHandler = async (params: any, ctx: any) => ({
      data: [],
      pagination: { cursor: null, hasMore: false, total: 0 },
    });
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      handlers: {
        list: listHandler,
      },
    });
    
    expect(User.handlers.list).toBe(listHandler);
  });

  it('should accept get handler override', () => {
    const getHandler = async (id: string, ctx: any) => ({ id, name: 'test' });
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      handlers: {
        get: getHandler,
      },
    });
    
    expect(User.handlers.get).toBe(getHandler);
  });

  it('should accept create handler override', () => {
    const createHandler = async (data: any, ctx: any) => ({ id: '1', ...data });
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      handlers: {
        create: createHandler,
      },
    });
    
    expect(User.handlers.create).toBe(createHandler);
  });

  it('should accept update handler override', () => {
    const updateHandler = async (id: string, data: any, ctx: any) => ({ id, ...data });
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      handlers: {
        update: updateHandler,
      },
    });
    
    expect(User.handlers.update).toBe(updateHandler);
  });

  it('should accept delete handler override', () => {
    const deleteHandler = async (id: string, ctx: any) => ({ id, deleted: true });
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      handlers: {
        delete: deleteHandler,
      },
    });
    
    expect(User.handlers.delete).toBe(deleteHandler);
  });
});

describe('domain() - custom actions', () => {
  it('should accept custom action', () => {
    const resetPassword = async (id: string, data: any, ctx: any) => ({
      ok: true,
      data: { success: true },
    });
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      actions: {
        resetPassword,
      },
    });
    
    expect(User.actions.resetPassword).toBe(resetPassword);
  });

  it('should accept multiple custom actions', () => {
    const actions = {
      resetPassword: async () => ({ ok: true, data: {} }),
      deactivate: async () => ({ ok: true, data: {} }),
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      actions,
    });
    
    expect(User.actions.resetPassword).toBe(actions.resetPassword);
    expect(User.actions.deactivate).toBe(actions.deactivate);
  });
});

describe('domain() - table requirement', () => {
  it('should require table for persisted type', () => {
    // @ts-expect-error - table is required for persisted type
    domain('users', {
      type: 'persisted',
    });
  });

  it('should require table for view type', () => {
    // @ts-expect-error - table is required for view type
    domain('stats', {
      type: 'view',
    });
  });

  it('should require table for session type', () => {
    // @ts-expect-error - table is required for session type
    domain('session', {
      type: 'session',
    });
  });
});

describe('domain() - immutable definition', () => {
  it('should return a frozen object', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
    });
    
    // The definition should be read-only
    expect(Object.isFrozen(User)).toBe(true);
  });

  it('should have readonly name', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
    });
    
    // Attempting to modify should throw or be ignored
    expect(() => {
      (User as any).name = 'other';
    }).toThrow();
  });
});
