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

// ---------------------------------------------------------------------------
// POC: allowWhere/allowOrderBy constrained to select keys (Unknown #1)
// ---------------------------------------------------------------------------
// This POC validates the fallback approach: allowWhere/allowOrderBy are typed
// against PublicColumnKeys<TTable> (same as select). The constraint that
// allowWhere keys ⊆ select keys is enforced at runtime by validateVertzQL().
//
// Adding a TSelect generic to entity() for compile-time enforcement was
// explored but rejected: TypeScript infers literal object types well, but
// the additional generic on the already-complex entity<TModel, TActions,
// TInject>() signature hurts DX (tooltip noise, error messages). The runtime
// validation catches mismatches with a clear error message, which is
// sufficient for the pre-v1 stage.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POC: T | null typing for descriptor-guarded fields (SDK response type)
// ---------------------------------------------------------------------------
// When expose.select has a field set to an AccessRule descriptor instead of
// `true`, the SDK response type should mark that field as T | null.
// This POC demonstrates the type utility that achieves this.
// ---------------------------------------------------------------------------

describe('POC: descriptor-guarded field T | null typing', () => {
  // Type utility: given a table type and an expose select config, produce
  // a response type where AccessRule-guarded fields become T | null.
  type ExposeResponseType<
    TTable extends Record<string, unknown>,
    TSelect extends Record<string, true | object>,
  > = {
    [K in keyof TSelect & keyof TTable]: TSelect[K] extends true ? TTable[K] : TTable[K] | null;
  };

  // Simulated table response type
  type EmployeeRow = {
    id: string;
    name: string;
    salary: number;
    ssn: string;
  };

  it('fields with `true` retain their original type', () => {
    type Select = { id: true; name: true; salary: { type: 'entitlement' }; ssn: { type: 'all' } };
    type Response = ExposeResponseType<EmployeeRow, Select>;

    const _check: Response['id'] = '' as string;
    void _check;

    const _check2: Response['name'] = '' as string;
    void _check2;
  });

  it('fields with AccessRule become T | null', () => {
    type Select = { id: true; salary: { type: 'entitlement' } };
    type Response = ExposeResponseType<EmployeeRow, Select>;

    // salary should be number | null
    const _check: Response['salary'] = null;
    void _check;

    const _check2: Response['salary'] = 42;
    void _check2;
  });

  it('fields with AccessRule cannot be assigned T directly without null', () => {
    type Select = { id: true; salary: { type: 'entitlement' } };
    type Response = ExposeResponseType<EmployeeRow, Select>;

    // Verify the union works — assigning to a variable typed as just `number` should fail
    // because the response type is `number | null`
    type SalaryType = Response['salary'];
    // number | null is NOT assignable to number
    // @ts-expect-error — number | null is not assignable to number
    const _narrow: number = {} as SalaryType;
    void _narrow;
  });
});

describe('POC: allowWhere/allowOrderBy field validity', () => {
  it('allowWhere accepts fields from PublicColumnKeys', () => {
    entity('posts', {
      model: postsModel,
      expose: {
        select: { id: true, title: true, status: true },
        allowWhere: { status: true },
      },
    });
  });

  it('allowWhere rejects hidden fields', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true },
        allowWhere: {
          name: true,
          // @ts-expect-error — passwordHash is hidden, can't be in allowWhere
          passwordHash: true,
        },
      },
    });
  });

  it('allowWhere rejects non-existent fields', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true },
        allowWhere: {
          // @ts-expect-error — notAField does not exist on usersTable
          notAField: true,
        },
      },
    });
  });

  it('allowOrderBy rejects hidden fields', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true, name: true },
        allowOrderBy: {
          name: true,
          // @ts-expect-error — passwordHash is hidden, can't be in allowOrderBy
          passwordHash: true,
        },
      },
    });
  });
});
