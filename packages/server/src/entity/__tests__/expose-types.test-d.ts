import { describe, it } from 'bun:test';
import { d } from '@vertz/db';
import { rules } from '../../auth/rules';
import { entity } from '../index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
  passwordHash: d.text().is('hidden'),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  content: d.text(),
  status: d.enum('post_status', ['draft', 'published']).default('draft'),
  authorId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
});

const commentsTable = d.table('comments', {
  id: d.uuid().primary(),
  text: d.text(),
  status: d.enum('comment_status', ['pending', 'approved', 'spam']),
  postId: d.uuid(),
  authorId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
});

const usersModel = d.model(usersTable, {
  posts: d.ref.many(() => postsTable, 'authorId'),
});

const postsModel = d.model(postsTable, {
  comments: d.ref.many(() => commentsTable, 'postId'),
  author: d.ref.one(() => usersTable, 'authorId'),
});

// ---------------------------------------------------------------------------
// expose.select — field exposure
// ---------------------------------------------------------------------------

describe('entity() expose.select types', () => {
  it('accepts select with public (non-hidden) fields', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      },
    });
  });

  it('accepts select with readOnly fields (readOnly restricts writes, not reads)', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, createdAt: true, updatedAt: true },
      },
    });
  });

  it('rejects hidden fields in select', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: {
          id: true,
          // @ts-expect-error — passwordHash is hidden, can't be exposed
          passwordHash: true,
        },
      },
    });
  });

  it('rejects fields not in the table', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: {
          id: true,
          // @ts-expect-error — 'notAField' does not exist on usersTable
          notAField: true,
        },
      },
    });
  });

  it('accepts AccessRule descriptors as select values', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: {
          id: true,
          name: true,
          email: rules.entitlement('user:view-email'),
        },
      },
    });
  });

  it('accepts composed AccessRule descriptors', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: {
          id: true,
          email: rules.all(rules.entitlement('user:view-email'), rules.fva(300)),
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// expose without select — type error
// ---------------------------------------------------------------------------

describe('entity() expose requires select', () => {
  it('rejects expose without select', () => {
    entity('users', {
      model: usersModel,
      // @ts-expect-error — expose requires select
      expose: {
        include: { posts: true },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// expose.allowWhere — filter allowlist
// ---------------------------------------------------------------------------

describe('entity() expose.allowWhere types', () => {
  it('accepts allowWhere with fields from select', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true, email: true, role: true },
        allowWhere: { name: true, role: true },
      },
    });
  });

  it('accepts AccessRule descriptors in allowWhere', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true, email: true },
        allowWhere: {
          name: true,
          email: rules.entitlement('user:filter-email'),
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// expose.allowOrderBy — sort allowlist
// ---------------------------------------------------------------------------

describe('entity() expose.allowOrderBy types', () => {
  it('accepts allowOrderBy with fields from select', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true, createdAt: true },
        allowOrderBy: { name: true, createdAt: true },
      },
    });
  });

  it('accepts AccessRule descriptors in allowOrderBy', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true, createdAt: true },
        allowOrderBy: {
          createdAt: true,
          name: rules.entitlement('user:sort-name'),
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// expose.include — relation exposure
// ---------------------------------------------------------------------------

describe('entity() expose.include types', () => {
  it('accepts valid relation names from model', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true },
        include: { posts: true },
      },
    });
  });

  it('accepts false to hide a relation', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true },
        include: { posts: false },
      },
    });
  });

  it('rejects relation names not in model', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true },
        include: {
          // @ts-expect-error — 'comments' is not a relation on usersModel
          comments: true,
        },
      },
    });
  });

  it('accepts RelationExposeConfig with select', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true },
        include: {
          posts: {
            select: { id: true, title: true },
          },
        },
      },
    });
  });

  it('accepts RelationExposeConfig with allowWhere and allowOrderBy', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true },
        include: {
          posts: {
            select: { id: true, title: true, status: true, createdAt: true },
            allowWhere: { status: true, createdAt: true },
            allowOrderBy: { createdAt: true },
            maxLimit: 50,
          },
        },
      },
    });
  });

  it('accepts nested include for recursive relation exposure', () => {
    entity('posts', {
      model: postsModel,
      expose: {
        select: { id: true, title: true, status: true },
        include: {
          comments: {
            select: { id: true, text: true },
            include: {
              author: {
                select: { id: true, name: true },
              },
            },
          },
          author: {
            select: { id: true, name: true },
          },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// expose.select with empty object — valid for junction entities
// ---------------------------------------------------------------------------

describe('entity() expose.select empty object', () => {
  it('accepts select: {} for junction entities', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: {},
        include: { posts: true },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// No expose — backwards compatible
// ---------------------------------------------------------------------------

describe('entity() without expose', () => {
  it('compiles without expose (backwards compatible)', () => {
    entity('users', {
      model: usersModel,
      access: { list: () => true },
    });
  });
});

// ---------------------------------------------------------------------------
// Full integration — all expose options together
// ---------------------------------------------------------------------------

describe('entity() full expose integration', () => {
  it('compiles with all expose options together', () => {
    entity('posts', {
      model: postsModel,
      access: {
        list: rules.authenticated(),
        get: rules.authenticated(),
      },
      expose: {
        select: {
          id: true,
          title: true,
          content: true,
          status: true,
          createdAt: true,
        },
        allowWhere: { status: true, createdAt: true },
        allowOrderBy: { createdAt: true, title: true },
        include: {
          comments: {
            select: { id: true, text: true, status: true, createdAt: true },
            allowWhere: { status: true, createdAt: true },
            allowOrderBy: { createdAt: true },
            maxLimit: 50,
            include: {
              author: {
                select: { id: true, name: true },
              },
            },
          },
          author: {
            select: { id: true, name: true },
          },
        },
      },
    });
  });
});
