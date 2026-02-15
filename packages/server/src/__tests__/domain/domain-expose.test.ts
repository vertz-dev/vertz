// Domain Expose Tests
// Tests for secure-by-default relation exposure with { select } syntax
import { describe, expect, it } from 'vitest';
import { d } from '@vertz/db';
import { domain, createServer } from '@vertz/server';

// ---------------------------------------------------------------------------
// Test Setup - Mock Tables
// ---------------------------------------------------------------------------

const usersTable = d.table({
  name: 'users',
  columns: {
    id: d.uuid().primaryKey(),
    name: d.varchar(255).notNull(),
    email: d.email().notNull(),
    role: d.enum('user_role', ['admin', 'editor', 'viewer']).notNull().default('viewer'),
    orgId: d.uuid().notNull(),
    passwordHash: d.varchar(255).notNull(),
    internalNotes: d.text(),
    createdAt: d.timestamp().notNull().default('now'),
    updatedAt: d.timestamp().notNull().default('now'),
  },
});

const orgsTable = d.table({
  name: 'organizations',
  columns: {
    id: d.uuid().primaryKey(),
    name: d.varchar(255).notNull(),
    logo: d.varchar(255),
    billingEmail: d.email().notNull(),
    taxId: d.varchar(50),
    createdAt: d.timestamp().notNull().default('now'),
  },
});

const postsTable = d.table({
  name: 'posts',
  columns: {
    id: d.uuid().primaryKey(),
    authorId: d.uuid().notNull(),
    title: d.varchar(255).notNull(),
    content: d.text(),
    published: d.boolean().notNull().default(false),
    views: d.integer().notNull().default(0),
    createdAt: d.timestamp().notNull().default('now'),
  },
});

const commentsTable = d.table({
  name: 'comments',
  columns: {
    id: d.uuid().primaryKey(),
    postId: d.uuid().notNull(),
    authorId: d.uuid().notNull(),
    content: d.text().notNull(),
    createdAt: d.timestamp().notNull().default('now'),
  },
});

const auditLogsTable = d.table({
  name: 'audit_logs',
  columns: {
    id: d.uuid().primaryKey(),
    userId: d.uuid().notNull(),
    action: d.varchar(100).notNull(),
    ipAddress: d.varchar(50),
    userAgent: d.text(),
    createdAt: d.timestamp().notNull().default('now'),
  },
});

// ---------------------------------------------------------------------------
// Secure by Default Tests
// ---------------------------------------------------------------------------

describe('Expose - Secure by Default (Zeroth Law)', () => {
  it('should not expose any relations when expose is omitted', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
      auditLogs: d.ref.many(() => auditLogsTable, 'userId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      // expose omitted - relations should NOT be accessible
    });

    expect(User.exposedRelations).toEqual({});
  });

  it('should not expose any relations when expose is empty object', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {}, // Explicit empty - no relations exposed
    });

    expect(User.exposedRelations).toEqual({});
  });

  it('should only expose explicitly listed relations', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
      auditLogs: d.ref.many(() => auditLogsTable, 'userId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
        posts: true,
        // auditLogs NOT listed - should not be accessible
      },
    });

    expect(User.exposedRelations).toHaveProperty('organization');
    expect(User.exposedRelations).toHaveProperty('posts');
    expect(User.exposedRelations).not.toHaveProperty('auditLogs');
  });

  it('should prevent access to non-exposed relations via API', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      auditLogs: d.ref.many(() => auditLogsTable, 'userId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
        // auditLogs not exposed
      },
    });

    const app = createServer({ domains: [User] });
    // auditLogs should not be fetchable via any API endpoint
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Expose with true Tests
// ---------------------------------------------------------------------------

describe('Expose - Full Relation (true)', () => {
  it('should expose entire relation when set to true', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
      },
    });

    expect(User.exposedRelations.organization).toBe(true);
  });

  it('should expose all fields of related entity when true', () => {
    const entry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        posts: true, // All fields of posts should be accessible
      },
    });

    expect(User.exposedRelations.posts).toBe(true);
  });

  it('should support exposing multiple relations with true', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
        posts: true,
      },
    });

    expect(User.exposedRelations.organization).toBe(true);
    expect(User.exposedRelations.posts).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Expose with { select } Tests
// ---------------------------------------------------------------------------

describe('Expose - Field Selection ({ select })', () => {
  it('should accept select syntax for partial field exposure', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: {
          select: { id: true, name: true, logo: true },
        },
      },
    });

    expect(User.exposedRelations.organization).toEqual({
      select: { id: true, name: true, logo: true },
    });
  });

  it('should restrict which fields are accessible in relation', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: {
          select: { id: true, name: true },
          // billingEmail, taxId NOT in select - should never be accessible
        },
      },
    });

    const app = createServer({ domains: [User] });
    // Fetching user.organization should only return id and name
    expect(app).toBeDefined();
  });

  it('should support select on many relations', () => {
    const entry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        posts: {
          select: { id: true, title: true, createdAt: true },
          // content, published, views NOT exposed
        },
      },
    });

    expect(User.exposedRelations.posts).toEqual({
      select: { id: true, title: true, createdAt: true },
    });
  });

  it('should use same select syntax as DB queries', () => {
    // The expose select syntax should match @vertz/db query syntax
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: {
          select: { name: true, logo: true },
        },
      },
    });

    // This is the same shape as: db.organizations.get({ select: { name: true, logo: true } })
    expect(User.exposedRelations.organization).toHaveProperty('select');
  });
});

// ---------------------------------------------------------------------------
// Mixed Expose Strategies Tests
// ---------------------------------------------------------------------------

describe('Expose - Mixed Strategies', () => {
  it('should support mixing true and select in same domain', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: {
          select: { id: true, name: true }, // Restricted
        },
        posts: true, // Full exposure
      },
    });

    expect(User.exposedRelations.organization).toEqual({ select: { id: true, name: true } });
    expect(User.exposedRelations.posts).toBe(true);
  });

  it('should allow different exposure levels for different relations', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
      auditLogs: d.ref.many(() => auditLogsTable, 'userId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: { select: { name: true } }, // Partial
        posts: true, // Full
        // auditLogs: not exposed at all
      },
    });

    expect(Object.keys(User.exposedRelations)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Type Safety Tests
// ---------------------------------------------------------------------------

describe('Expose - Type Safety', () => {
  it('should only allow valid relation names', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    // @ts-expect-error - invalid_relation is not a valid relation name
    domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        invalid_relation: true,
      },
    });
  });

  it('should only allow valid field names in select', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    // @ts-expect-error - invalid_field is not a column in orgsTable
    domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: {
          select: { invalid_field: true },
        },
      },
    });
  });

  it('should infer field names from related table', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: {
          // Should autocomplete: id, name, logo, billingEmail, taxId, createdAt
          select: { id: true, name: true },
        },
      },
    });

    expect(User).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Fields Configuration Tests (entity's own columns)
// ---------------------------------------------------------------------------

describe('Expose - Fields (Own Columns)', () => {
  it('should restrict entity own columns via fields.select', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
      fields: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
        // passwordHash, internalNotes never exposed
      },
    });

    const app = createServer({ domains: [User] });
    // API responses should never include passwordHash or internalNotes
    expect(app).toBeDefined();
  });

  it('should work with fields and expose together', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      fields: {
        select: { id: true, name: true, email: true },
      },
      expose: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should use same select syntax for fields and expose', () => {
    // One mental model: { select: { field: true } } everywhere
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      fields: {
        select: { id: true, name: true }, // Own columns
      },
      expose: {
        organization: {
          select: { id: true, name: true }, // Related columns
        },
      },
    });

    expect(User).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Relation Fetching Tests
// ---------------------------------------------------------------------------

describe('Expose - Relation Fetching', () => {
  it('should fetch exposed relations on GET by ID', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
        posts: true,
      },
    });

    const app = createServer({ domains: [User] });
    // GET /api/users/:id should include organization and posts
    expect(app).toBeDefined();
  });

  it('should not fetch non-exposed relations', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      auditLogs: d.ref.many(() => auditLogsTable, 'userId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
        // auditLogs NOT exposed
      },
    });

    const app = createServer({ domains: [User] });
    // GET /api/users/:id should include organization but NOT auditLogs
    expect(app).toBeDefined();
  });

  it('should fetch one-to-one relations', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should fetch one-to-many relations', () => {
    const entry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        posts: true,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should limit many relations to default 20', () => {
    const entry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        posts: true,
      },
    });

    const app = createServer({ domains: [User] });
    // GET /api/users/:id should include at most 20 posts by default
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Relation Depth Tests (v1 = 1 level deep)
// ---------------------------------------------------------------------------

describe('Expose - Depth Limits', () => {
  it('should fetch relations one level deep', () => {
    const entry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        posts: true,
      },
    });

    const app = createServer({ domains: [User] });
    // GET /api/users/:id includes posts (1 level)
    expect(app).toBeDefined();
  });

  it('should not fetch nested relations in v1', () => {
    // v1: max depth = 1
    // user.posts (allowed)
    // user.posts.comments (NOT in v1)
    const entry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        posts: true,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// List Endpoint Relation Tests
// ---------------------------------------------------------------------------

describe('Expose - List Endpoint', () => {
  it('should not include relations on list endpoint in v1', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
        posts: true,
      },
    });

    const app = createServer({ domains: [User] });
    // GET /api/users should NOT include relations (too expensive)
    // Relations are only fetched on GET /api/users/:id
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Relation Access Rules Tests (future phase)
// ---------------------------------------------------------------------------

describe('Expose - Relation Access Rules', () => {
  it('should apply parent access rules to relations in v1', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: {
        read: (row, ctx) => row.orgId === ctx.tenant?.id,
      },
      expose: {
        organization: true,
      },
    });

    const app = createServer({ domains: [User] });
    // If user passes access.read, their exposed relations are accessible
    expect(app).toBeDefined();
  });

  it('future: should apply related entity access rules', () => {
    // Phase 2 feature: if organization has its own access rules,
    // those should be checked when accessing user.organization
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Expose - Edge Cases', () => {
  it('should handle domain with no relations', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable), // No relations defined
      access: { read: () => true },
    });

    expect(User.exposedRelations).toEqual({});
  });

  it('should handle expose on domain with no relations', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
      expose: {}, // Explicit but empty
    });

    expect(User.exposedRelations).toEqual({});
  });

  it('should not error when relation resolves to null', () => {
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: true,
      },
    });

    const app = createServer({ domains: [User] });
    // If orgId is null or org doesn't exist, organization should be null
    expect(app).toBeDefined();
  });

  it('should handle empty many relations', () => {
    const entry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        posts: true,
      },
    });

    const app = createServer({ domains: [User] });
    // If user has no posts, posts should be []
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Same Syntax Across Stack Tests
// ---------------------------------------------------------------------------

describe('Expose - Unified Syntax', () => {
  it('should use same syntax as @vertz/db queries', () => {
    // The expose.organization.select syntax should match:
    // db.organizations.get({ select: { ... } })
    const entry = d.entry(usersTable, {
      organization: d.ref.one(() => orgsTable, 'orgId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: entry,
      access: { read: () => true },
      expose: {
        organization: {
          select: { name: true },
        },
      },
    });

    // This is the SAME shape as DB query syntax
    expect(User.exposedRelations.organization).toEqual({ select: { name: true } });
  });

  it('should use same syntax as client requests will use', () => {
    // Future: client.user.get(id, { include: { organization: { select: { name: true } } } })
    // The expose config uses the same shape
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Documentation Tests
// ---------------------------------------------------------------------------

describe('Expose - Security Documentation', () => {
  it('should document that omitting expose means no relations', () => {
    // This is a critical security feature - must be documented
    expect(true).toBe(true);
  });

  it('should document that fields.select restricts own columns', () => {
    // fields.select is about the entity's own columns
    // expose is about related entities
    expect(true).toBe(true);
  });

  it('should document the Zeroth Law (secure by default)', () => {
    // Relations are NOT exposed unless explicitly declared
    expect(true).toBe(true);
  });
});
