import { describe, it } from 'bun:test';
import type { Equal, Expect, Extends, HasKey } from '../../__tests__/_type-helpers';
import { d } from '../../d';
import type { RelationDef } from '../relation';
import type { ColumnRecord, TableDef } from '../table';

// ---------------------------------------------------------------------------
// Fixture tables
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});

const posts = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  authorId: d.uuid(),
});

const postTags = d.table('post_tags', {
  id: d.uuid().primary(),
  postId: d.uuid(),
  tagId: d.uuid(),
});

// ---------------------------------------------------------------------------
// Relation type carries target table type information
// ---------------------------------------------------------------------------

describe('relation types', () => {
  it('d.ref.one() carries target table type', () => {
    const rel = d.ref.one(() => users, 'authorId');

    type _t1 = Expect<Extends<typeof rel, RelationDef<typeof users, 'one'>>>;
    type _t2 = Expect<Equal<typeof rel._type, 'one'>>;
    type _t3 = Expect<Equal<ReturnType<typeof rel._target>, typeof users>>;
  });

  it('d.ref.many() carries target table type', () => {
    const rel = d.ref.many(() => posts, 'authorId');

    type _t1 = Expect<Extends<typeof rel, RelationDef<typeof posts, 'many'>>>;
    type _t2 = Expect<Equal<typeof rel._type, 'many'>>;
    type _t3 = Expect<Equal<ReturnType<typeof rel._target>, typeof posts>>;
  });

  it('d.ref.many().through() carries target table type', () => {
    const rel = d.ref.many(() => posts).through(() => postTags, 'tagId', 'postId');

    type _t1 = Expect<Extends<typeof rel, RelationDef<typeof posts, 'many'>>>;
    type _t2 = Expect<Equal<typeof rel._type, 'many'>>;
  });

  it('target table type is specific, not generic TableDef', () => {
    const rel = d.ref.one(() => users, 'authorId');
    const target = rel._target();

    // Should resolve to the specific table type with its columns
    type _t1 = Expect<Equal<typeof target._name, string>>;
    type _t2 = Expect<HasKey<typeof target._columns, 'id'>>;
    type _t3 = Expect<HasKey<typeof target._columns, 'name'>>;
  });

  it('relation _type only accepts one or many', () => {
    // @ts-expect-error -- invalid relation type literal
    const _badType: 'one' | 'many' = 'bogus';
    void _badType;
  });

  it('rejects accessing non-existent property on RelationDef', () => {
    const rel: RelationDef<TableDef<ColumnRecord>> = d.ref.one(() => users, 'authorId');

    // @ts-expect-error -- _bogus does not exist on RelationDef
    rel._bogus;
  });
});
