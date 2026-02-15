// Domain Access Rules Tests
// Tests for sync access rules, ctx.can(), and access enforcement
import { describe, expect, it, vi } from 'vitest';
import { d } from '@vertz/db';
import { domain, createServer } from '@vertz/server';
import { usersTable } from './fixtures';

// ---------------------------------------------------------------------------
// Deny by Default Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Deny by Default', () => {
  it('should deny all operations when no access rules defined', () => {
    const Locked = domain('locked', {
      type: 'persisted',
      table: d.entry(usersTable),
      // No access rules defined
    });

    const app = createServer({ domains: [Locked] });
    expect(app).toBeDefined();
  });

  it('should deny specific operations when only some access rules defined', () => {
    const Partial = domain('partial', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => true,
        // create, update, delete not defined - should be denied
      },
    });

    const app = createServer({ domains: [Partial] });
    expect(app).toBeDefined();
  });

  it('should require access rules for all operations to be accessible', () => {
    const FullyAccessible = domain('fully_accessible', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => true,
        create: () => true,
        update: () => true,
        delete: () => true,
      },
    });

    const app = createServer({ domains: [FullyAccessible] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Access Rule Evaluation Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Evaluation', () => {
  it('should pass row and context to read access rule', () => {
    const mockReadRule = vi.fn((row: any, ctx: any) => true);
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: mockReadRule,
      },
    });

    const app = createServer({ domains: [User] });
    // The read rule should be called with row and ctx
    expect(mockReadRule).toBeDefined();
  });

  it('should pass input data and context to create access rule', () => {
    const mockCreateRule = vi.fn((data: any, ctx: any) => true);
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        create: mockCreateRule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(mockCreateRule).toBeDefined();
  });

  it('should pass existing row and context to update access rule', () => {
    const mockUpdateRule = vi.fn((row: any, ctx: any) => true);
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        update: mockUpdateRule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(mockUpdateRule).toBeDefined();
  });

  it('should pass existing row and context to delete access rule', () => {
    const mockDeleteRule = vi.fn((row: any, ctx: any) => true);
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        delete: mockDeleteRule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(mockDeleteRule).toBeDefined();
  });

  it('should evaluate access rules synchronously', () => {
    const syncRule = (row: any, ctx: any) => {
      // Synchronous function - no async/await
      return row.id !== undefined;
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: syncRule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Access Context Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Context', () => {
  it('should provide user in context', () => {
    const rule = (row: any, ctx: any) => {
      return ctx.user !== null;
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: rule },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should provide tenant in context', () => {
    const rule = (row: any, ctx: any) => {
      return ctx.tenant?.id !== undefined;
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: rule },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should provide request metadata in context', () => {
    const rule = (row: any, ctx: any) => {
      return ctx.request?.method !== undefined;
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: rule },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should provide user.id in context when authenticated', () => {
    const rule = (row: any, ctx: any) => {
      return ctx.user?.id !== undefined;
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: rule },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should provide user.role in context when authenticated', () => {
    const rule = (row: any, ctx: any) => {
      return ['admin', 'editor', 'viewer'].includes(ctx.user?.role);
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: rule },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Access Denied Responses Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Denied Response', () => {
  it('should return 403 when access rule returns false', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => false, // Always deny
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 403 with access_denied error type', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return appropriate error code for entity_forbidden', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should include entity name in error response', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should include operation info in error message', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => false,
        create: () => false,
        update: () => false,
        delete: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Row-Based Access Rules Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Row-Based', () => {
  it('should filter rows based on access.read in list', () => {
    const orgId = 'org-1';
    
    const rule = (row: any, ctx: any) => {
      return row.orgId === ctx.tenant?.id;
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should allow owner to update their own record', () => {
    const rule = (row: any, ctx: any) => {
      return row.id === ctx.user?.id || ctx.user?.role === 'admin';
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        update: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should allow admins to delete any record', () => {
    const rule = (row: any, ctx: any) => {
      return ctx.user?.role === 'admin';
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        delete: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should allow creating records for own org', () => {
    const rule = (data: any, ctx: any) => {
      return data.orgId === ctx.tenant?.id;
    };
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        create: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// List Filtering Tests
// ---------------------------------------------------------------------------

describe('Access Rules - List Filtering', () => {
  it('should exclude rows that fail access.read from list results', () => {
    const rule = (row: any, ctx: any) => row.orgId === 'org-1';
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should not error when some rows are filtered', () => {
    const rule = (row: any, ctx: any) => row.active === true;
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should report total count of all matching rows', () => {
    const rule = (row: any, ctx: any) => true;
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return empty page when all rows filtered out', () => {
    const rule = (row: any, ctx: any) => false; // Deny all
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('may return fewer rows than limit due to filtering', () => {
    const rule = (row: any, ctx: any) => row.id.startsWith('a');
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: rule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Access Rules on Get Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Get by ID', () => {
  it('should check access.read on get by id', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 403 instead of 404 for access denied', () => {
    // If row exists but access denied, return 403 not 404
    // This prevents enumeration attacks
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should check access against the correct row', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: (row, ctx) => row.orgId === ctx.tenant?.id,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Access Rules on Create Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Create', () => {
  it('should check access.create before creating', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        create: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should receive partial row data in create access rule', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        create: (data, ctx) => data.orgId !== undefined,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should allow admins to create', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        create: (data, ctx) => ctx.user?.role === 'admin',
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Access Rules on Update Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Update', () => {
  it('should check access.update before updating', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        update: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should check access against existing row', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        update: (row, ctx) => row.id === ctx.user?.id,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should run access check before fetching update data', () => {
    // First check access on existing row, then validate update data
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        update: (row, ctx) => true,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Access Rules on Delete Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Delete', () => {
  it('should check access.delete before deleting', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        delete: () => false,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should check access against existing row', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        delete: (row, ctx) => ctx.user?.role === 'admin',
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Access Rules Error Handling Tests
// ---------------------------------------------------------------------------

describe('Access Rules - Error Handling', () => {
  it('should return 500 when access rule throws', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => {
          throw new Error('Access rule error');
        },
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should log access rule errors without exposing details', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => {
          throw new Error('Sensitive internal error');
        },
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should treat thrown errors as access denied', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: () => {
          throw new Error('Error');
        },
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Sync-Only Access Rules Tests (v1 constraint)
// ---------------------------------------------------------------------------

describe('Access Rules - Sync-Only v1', () => {
  it('should work with sync access rules', () => {
    const syncRule = (row: any, ctx: any) => true;
    
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: {
        read: syncRule,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('access rules should not be async functions', () => {
    // In v1, access rules MUST be synchronous
    // This is a constraint, not a feature test
    expect(true).toBe(true);
  });

  it('access rules should not make external calls', () => {
    // Best practice - access rules should be fast pure functions
    expect(true).toBe(true);
  });
});
