import { describe, expectTypeOf, it } from 'vitest';
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
  authorId: d.uuid().references('users'),
});

const postTags = d.table('post_tags', {
  id: d.uuid().primary(),
  postId: d.uuid().references('posts'),
  tagId: d.uuid().references('tags'),
});

// ---------------------------------------------------------------------------
// Relation type carries target table type information
// ---------------------------------------------------------------------------

describe('relation types', () => {
  it('d.ref.one() carries target table type', () => {
    const rel = d.ref.one(() => users, 'authorId');

    expectTypeOf(rel).toMatchTypeOf<RelationDef<typeof users, 'one'>>();
    expectTypeOf(rel._type).toEqualTypeOf<'one'>();
    expectTypeOf(rel._target()).toEqualTypeOf<typeof users>();
  });

  it('d.ref.many() carries target table type', () => {
    const rel = d.ref.many(() => posts, 'authorId');

    expectTypeOf(rel).toMatchTypeOf<RelationDef<typeof posts, 'many'>>();
    expectTypeOf(rel._type).toEqualTypeOf<'many'>();
    expectTypeOf(rel._target()).toEqualTypeOf<typeof posts>();
  });

  it('d.ref.many().through() carries target table type', () => {
    const rel = d.ref.many(() => posts).through(() => postTags, 'tagId', 'postId');

    expectTypeOf(rel).toMatchTypeOf<RelationDef<typeof posts, 'many'>>();
    expectTypeOf(rel._type).toEqualTypeOf<'many'>();
  });

  it('target table type is specific, not generic TableDef', () => {
    const rel = d.ref.one(() => users, 'authorId');
    const target = rel._target();

    // Should resolve to the specific table type with its columns
    expectTypeOf<typeof target._name>().toEqualTypeOf<string>();
    expectTypeOf(target._columns).toHaveProperty('id');
    expectTypeOf(target._columns).toHaveProperty('name');
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
