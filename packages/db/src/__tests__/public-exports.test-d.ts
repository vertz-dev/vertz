import { describe, it } from '@vertz/test';
import {
  d,
  type BytesColumnBuilder,
  type ColumnBuilder,
  type ColumnRecord,
  type DefaultMeta,
  type EnumMeta,
  type EnumSchemaLike,
  type ManyRelationDef,
  type ModelDef,
  type NumericColumnBuilder,
  type RelationDef,
  type SerialMeta,
  type TableDef,
  type TableOptions,
  type ThroughDef,
  type ValidateOneRelationFKs,
  type VectorMeta,
} from '../index';
import type { Equal, Expect } from './_type-helpers';

// ---------------------------------------------------------------------------
// Issue #2778 — every type referenced by a public return signature of `d.*`
// must be re-exported from the package entry. Otherwise consumers emitting
// declaration files hit TS2742 ("cannot be named without a reference to an
// internal module like @vertz/db/dist/schema/column").
//
// The `import type { ... } from '../index'` block below is itself the primary
// regression guard: removing any of these from `src/index.ts` fails the import
// with TS2305 before the body of any test runs. The per-test `Equal<...>` blocks
// additionally pin the structural contract each type names.
// ---------------------------------------------------------------------------

describe('Public API exports — issue #2778', () => {
  it('DefaultMeta covers d.uuid() / d.text() / d.boolean() return metadata', () => {
    type UuidReturn = ReturnType<typeof d.uuid>;
    type BooleanReturn = ReturnType<typeof d.boolean>;
    type _t1 = Expect<Equal<UuidReturn, ColumnBuilder<string, DefaultMeta<'uuid'>>>>;
    type _t2 = Expect<Equal<BooleanReturn, ColumnBuilder<boolean, DefaultMeta<'boolean'>>>>;
  });

  it('SerialMeta names the return metadata of d.serial()', () => {
    type SerialReturn = ReturnType<typeof d.serial>;
    type _t1 = Expect<Equal<SerialReturn, NumericColumnBuilder<number, SerialMeta>>>;
  });

  it('BytesColumnBuilder names the return type of d.bytea()', () => {
    type ByteaReturn = ReturnType<typeof d.bytea>;
    type _t1 = Expect<Equal<ByteaReturn, BytesColumnBuilder<Uint8Array, DefaultMeta<'bytea'>>>>;
  });

  it('VectorMeta names the return metadata of d.vector()', () => {
    const col = d.vector(3);
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Equal<Meta, VectorMeta<3>>>;
  });

  it('ColumnRecord and TableOptions are accepted by d.table()', () => {
    const cols = { id: d.uuid().primary(), title: d.text() };
    type Cols = typeof cols;
    // Constraint check: Cols must satisfy ColumnRecord.
    type _t1 = Expect<Equal<Cols extends ColumnRecord ? true : false, true>>;

    const opts: TableOptions = {};
    const table = d.table('t', cols, opts);
    type _t2 = Expect<Equal<typeof table extends TableDef<Cols> ? true : false, true>>;
  });

  it('ValidateOneRelationFKs shape matches d.model() relation constraints', () => {
    const user = d.table('user', { id: d.uuid().primary() });
    const post = d.table('post', { id: d.uuid().primary(), userId: d.uuid() });
    const relations = { author: d.ref.one(() => user, 'userId') };
    type Validated = ValidateOneRelationFKs<typeof post, typeof relations>;
    // The validated shape exposes the relation keys from the input record.
    type _t1 = Expect<Equal<keyof Validated, 'author'>>;
  });

  it('ThroughDef and ManyRelationDef are nameable from the public entry', () => {
    const tag = d.table('tag', { id: d.uuid().primary() });
    const manyRef = d.ref.many(() => tag);
    type _t1 = Expect<Equal<typeof manyRef, ManyRelationDef<typeof tag>>>;
    // ThroughDef is the element type of RelationDef['_through'].
    type Through = NonNullable<RelationDef['_through']>;
    type _t2 = Expect<Equal<Through, ThroughDef>>;
  });

  it('d.model() return type is nameable via ModelDef + ColumnRecord', () => {
    const todo = d.table('todo', { id: d.uuid().primary(), title: d.text() });
    const model = d.model(todo);
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} is the public default for "no relations"
    type _t1 = Expect<Equal<typeof model, ModelDef<typeof todo, {}>>>;
  });

  // Issue #2804 — EnumSchemaLike is referenced by the d.enum(name, schema) overload.
  // It must be re-exported so consumers naming `typeof d.enum` (or emitting .d.ts that
  // pins that overload) don't trip TS2742 against @vertz/db/dist/d.
  it('EnumSchemaLike names the second-overload parameter shape of d.enum()', () => {
    const roleSchema: EnumSchemaLike<readonly ['admin', 'member']> = {
      values: ['admin', 'member'] as const,
    };
    const col = d.enum('role', roleSchema);
    type _t1 = Expect<
      Equal<
        typeof col,
        ColumnBuilder<'admin' | 'member', EnumMeta<'role', readonly ['admin', 'member']>>
      >
    >;
  });
});
