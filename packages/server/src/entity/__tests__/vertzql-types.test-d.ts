import { describe, it } from 'bun:test';
import { d } from '@vertz/db';
import { entity } from '../entity';
import type {
  TypedIncludeOption,
  TypedQueryOptions,
  TypedSelectOption,
  TypedWhereOption,
} from '../types';

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
});

const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  body: d.text(),
  authorId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
});

const tagsTable = d.table('tags', {
  id: d.uuid().primary(),
  label: d.text(),
  color: d.text(),
});

const usersModel = d.model(usersTable, {
  posts: d.ref.many(() => postsTable, 'authorId'),
});

const postsModel = d.model(postsTable, {
  author: d.ref.one(() => usersTable, 'authorId'),
  tags: d.ref.many(() => tagsTable, 'postId'),
});

// ---------------------------------------------------------------------------
// EntityRelationsConfig — field narrowing constrained to target table columns
// ---------------------------------------------------------------------------

describe('expose.include field narrowing', () => {
  it('accepts field names that exist on the target relation table (with select wrapper)', () => {
    // posts target is postsTable, which has id, title, body, authorId, createdAt
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true },
        include: {
          posts: { select: { id: true, title: true } },
        },
      },
    });
  });

  it('rejects field names that do NOT exist on the target relation table', () => {
    entity('users', {
      model: usersModel,
      expose: {
        select: { id: true },
        include: {
          // @ts-expect-error — 'nonExistentField' is not a column on postsTable
          posts: { select: { id: true, nonExistentField: true } },
        },
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
});

// ---------------------------------------------------------------------------
// EntityRelationsConfig — multi-relation models
// ---------------------------------------------------------------------------

describe('expose.include with multiple relations', () => {
  it('accepts valid field narrowing on multiple relations', () => {
    entity('posts', {
      model: postsModel,
      expose: {
        select: { id: true },
        include: {
          author: { select: { id: true, name: true } },
          tags: { select: { id: true, label: true } },
        },
      },
    });
  });

  it('rejects fields from wrong relation table', () => {
    entity('posts', {
      model: postsModel,
      expose: {
        select: { id: true },
        include: {
          // @ts-expect-error — 'label' is a column on tagsTable, not usersTable
          author: { select: { id: true, label: true } },
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// TypedSelectOption — only public (non-hidden) column keys
// ---------------------------------------------------------------------------

describe('TypedSelectOption restricts to non-hidden columns', () => {
  it('accepts public columns', () => {
    const _select: TypedSelectOption<typeof usersTable> = {
      id: true,
      name: true,
      email: true,
      role: true,
    };
    void _select;
  });

  it('rejects hidden columns', () => {
    const _select: TypedSelectOption<typeof usersTable> = {
      name: true,
      // @ts-expect-error — passwordHash is hidden
      passwordHash: true,
    };
    void _select;
  });
});

// ---------------------------------------------------------------------------
// TypedWhereOption — only public (non-hidden) column keys
// ---------------------------------------------------------------------------

describe('TypedWhereOption restricts to non-hidden columns', () => {
  it('accepts public columns', () => {
    const _where: TypedWhereOption<typeof usersTable> = {
      role: 'admin',
      name: 'Alice',
    };
    void _where;
  });

  it('rejects hidden columns', () => {
    const _where: TypedWhereOption<typeof usersTable> = {
      role: 'admin',
      // @ts-expect-error — passwordHash is hidden
      passwordHash: 'hash',
    };
    void _where;
  });
});

// ---------------------------------------------------------------------------
// TypedIncludeOption — constrained by entity relations config
// ---------------------------------------------------------------------------

describe('TypedIncludeOption constrained by relations config', () => {
  // Simulate a relations config that exposes author with narrowed fields
  // and tags as fully open
  type PostRelationsConfig = {
    author: { select: { id: true; name: true } };
    tags: true;
  };

  it('accepts true for fully exposed relations', () => {
    const _include: TypedIncludeOption<PostRelationsConfig> = {
      tags: true,
    };
    void _include;
  });

  it('accepts true for narrowed relations (returns allowed fields)', () => {
    const _include: TypedIncludeOption<PostRelationsConfig> = {
      author: true,
    };
    void _include;
  });

  it('accepts a subset of allowed fields for narrowed relations', () => {
    const _include: TypedIncludeOption<PostRelationsConfig> = {
      author: { select: { id: true } },
    };
    void _include;
  });

  it('rejects relations set to false in config', () => {
    type RestrictedConfig = {
      author: false;
      tags: true;
    };
    const _include: TypedIncludeOption<RestrictedConfig> = {
      // @ts-expect-error — author is set to false in config
      author: true,
    };
    void _include;
  });
});

// ---------------------------------------------------------------------------
// TypedQueryOptions — full integration
// ---------------------------------------------------------------------------

describe('TypedQueryOptions full integration', () => {
  type TestRelationsConfig = {
    posts: { select: { id: true; title: true } };
  };

  it('accepts valid where + select + include', () => {
    const _opts: TypedQueryOptions<typeof usersTable, TestRelationsConfig> = {
      where: { role: 'admin' },
      select: { name: true, email: true },
      include: { posts: { select: { id: true } } },
      limit: 20,
      orderBy: { name: 'asc' },
    };
    void _opts;
  });

  it('rejects hidden field in where', () => {
    const _opts: TypedQueryOptions<typeof usersTable, TestRelationsConfig> = {
      // @ts-expect-error — passwordHash is hidden
      where: { passwordHash: 'x' },
    };
    void _opts;
  });

  it('rejects hidden field in select', () => {
    const _opts: TypedQueryOptions<typeof usersTable, TestRelationsConfig> = {
      // @ts-expect-error — passwordHash is hidden
      select: { passwordHash: true },
    };
    void _opts;
  });

  it('rejects hidden field in orderBy', () => {
    const _opts: TypedQueryOptions<typeof usersTable, TestRelationsConfig> = {
      // @ts-expect-error — passwordHash is hidden
      orderBy: { passwordHash: 'asc' },
    };
    void _opts;
  });
});
