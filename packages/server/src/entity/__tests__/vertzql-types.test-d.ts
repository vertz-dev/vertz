import { describe, it } from '@vertz/test';
import { d } from '@vertz/db';
import type { ModelEntry } from '@vertz/db';
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
  postId: d.uuid(),
});

const commentsTable = d.table('comments', {
  id: d.uuid().primary(),
  text: d.text(),
  postId: d.uuid(),
  authorId: d.uuid(),
});

const usersModel = d.model(usersTable, {
  posts: d.ref.many(() => postsTable, 'authorId'),
});

const postsModel = d.model(postsTable, {
  author: d.ref.one(() => usersTable, 'authorId'),
  tags: d.ref.many(() => tagsTable, 'postId'),
  comments: d.ref.many(() => commentsTable, 'postId'),
});

const commentsModel = d.model(commentsTable, {
  author: d.ref.one(() => usersTable, 'authorId'),
  post: d.ref.one(() => postsTable, 'postId'),
});

// Model registry for TModels-threaded tests
type TestModels = {
  users: ModelEntry<typeof usersTable, (typeof usersModel)['relations']>;
  posts: ModelEntry<typeof postsTable, (typeof postsModel)['relations']>;
  tags: ModelEntry<typeof tagsTable, Record<string, never>>;
  comments: ModelEntry<typeof commentsTable, (typeof commentsModel)['relations']>;
};

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

// ---------------------------------------------------------------------------
// TypedIncludeOption — TModels threading for typed nested includes (#2309)
// ---------------------------------------------------------------------------

describe('TypedIncludeOption with TModels threading', () => {
  type PostRelConfig = {
    author: { select: { id: true; name: true } };
    comments: true;
    tags: true;
  };

  type PostRelations = (typeof postsModel)['relations'];

  describe('Given a true-config relation with TModels', () => {
    it('Then accepts valid nested include keys', () => {
      const _inc: TypedIncludeOption<PostRelConfig, PostRelations, TestModels> = {
        comments: {
          include: {
            author: true,
            post: true,
          },
        },
      };
      void _inc;
    });

    it('Then rejects invalid nested include keys', () => {
      const _inc: TypedIncludeOption<PostRelConfig, PostRelations, TestModels> = {
        comments: {
          // @ts-expect-error — 'bogus' is not a relation on comments model
          include: { bogus: true },
        },
      };
      void _inc;
    });

    it('Then accepts structured form with where/orderBy/limit', () => {
      const _inc: TypedIncludeOption<PostRelConfig, PostRelations, TestModels> = {
        comments: {
          where: { text: 'hello' },
          orderBy: { text: 'asc' },
          limit: 10,
        },
      };
      void _inc;
    });
  });

  describe('Given a RelationConfigObject relation with TModels', () => {
    it('Then accepts select + nested include together', () => {
      const _inc: TypedIncludeOption<PostRelConfig, PostRelations, TestModels> = {
        author: {
          select: { id: true },
          include: { posts: true },
        },
      };
      void _inc;
    });

    it('Then rejects invalid nested include keys on RelationConfigObject', () => {
      const _inc: TypedIncludeOption<PostRelConfig, PostRelations, TestModels> = {
        author: {
          select: { id: true },
          // @ts-expect-error — 'bogus' is not a relation on users model
          include: { bogus: true },
        },
      };
      void _inc;
    });
  });

  describe('Given no TModels (backward compat)', () => {
    it('Then nested include is untyped (accepts any key)', () => {
      const _inc: TypedIncludeOption<PostRelConfig> = {
        comments: {
          include: { anything: true },
        },
      };
      void _inc;
    });
  });

  describe('Given TypedQueryOptions with TModels', () => {
    it('Then TModels flows through to TypedIncludeOption', () => {
      const _opts: TypedQueryOptions<typeof postsTable, PostRelConfig, PostRelations, TestModels> =
        {
          include: {
            comments: {
              include: { author: true },
            },
          },
        };
      void _opts;
    });

    it('Then rejects invalid nested keys through TypedQueryOptions', () => {
      const _opts: TypedQueryOptions<typeof postsTable, PostRelConfig, PostRelations, TestModels> =
        {
          include: {
            comments: {
              // @ts-expect-error — 'bogus' is not a relation on comments
              include: { bogus: true },
            },
          },
        };
      void _opts;
    });
  });

  describe('Given top-level access filtering', () => {
    it('Then false-config relations are still rejected', () => {
      type RestrictedConfig = {
        author: false;
        comments: true;
        tags: true;
      };
      const _inc: TypedIncludeOption<RestrictedConfig, PostRelations, TestModels> = {
        // @ts-expect-error — author is set to false in config
        author: true,
      };
      void _inc;
    });
  });

  describe('Given deep nesting (depth cap)', () => {
    it('Then allows 4 typed nesting levels (1 entity + 3 DB)', () => {
      // Entity level 1: comments (true-config)
      // DB depth 0: author
      // DB depth 1: posts
      // DB depth 2: comments (still typed — 3 DB levels)
      const _inc: TypedIncludeOption<PostRelConfig, PostRelations, TestModels> = {
        comments: {
          include: {
            author: {
              include: {
                posts: {
                  include: {
                    comments: true, // DB depth 2 — still typed
                  },
                },
              },
            },
          },
        },
      };
      void _inc;
    });

    it('Then falls back to untyped at depth 5 (1 entity + 3 DB + untyped)', () => {
      // Entity level 1: comments
      // DB depth 0: author
      // DB depth 1: posts
      // DB depth 2: comments
      // DB depth 3: untyped fallback — 'anything' compiles
      const _inc: TypedIncludeOption<PostRelConfig, PostRelations, TestModels> = {
        comments: {
          include: {
            author: {
              include: {
                posts: {
                  include: {
                    comments: {
                      include: {
                        anything: true, // DB depth 3 → untyped fallback
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      void _inc;
    });
  });
});
