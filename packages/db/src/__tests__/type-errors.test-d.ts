import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../d';
import type { FilterType, SelectOption } from '../schema/inference';
import type {
  InvalidColumn,
  InvalidFilterType,
  InvalidRelation,
  ValidateKeys,
} from '../types/branded-errors';

// ---------------------------------------------------------------------------
// Fixture tables
// ---------------------------------------------------------------------------

const users = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
  email: d.email().unique().sensitive(),
  passwordHash: d.text().hidden(),
  age: d.integer().nullable(),
  role: d.enum('user_role', ['admin', 'editor', 'viewer']).default('viewer'),
  active: d.boolean().default(true),
});

// Posts and relations defined for future use in extended tests
void d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  content: d.text(),
  authorId: d.uuid().references('users', 'id'),
  status: d.enum('post_status', ['draft', 'published']).default('draft'),
});

// ---------------------------------------------------------------------------
// InvalidColumn branded type
// ---------------------------------------------------------------------------

describe('InvalidColumn branded type', () => {
  it('produces a readable error string type', () => {
    type Err = InvalidColumn<'nonExistent', 'users'>;
    expectTypeOf<Err>().toEqualTypeOf<"ERROR: Column 'nonExistent' does not exist on table 'users'.">();
  });

  it('produces error for different table names', () => {
    type Err = InvalidColumn<'bogus', 'posts'>;
    expectTypeOf<Err>().toEqualTypeOf<"ERROR: Column 'bogus' does not exist on table 'posts'.">();
  });
});

// ---------------------------------------------------------------------------
// InvalidFilterType branded type
// ---------------------------------------------------------------------------

describe('InvalidFilterType branded type', () => {
  it('produces readable filter error', () => {
    type Err = InvalidFilterType<'age', 'number', 'string'>;
    expectTypeOf<Err>().toEqualTypeOf<"ERROR: Filter on 'age' expects type 'number', got 'string'.">();
  });
});

// ---------------------------------------------------------------------------
// InvalidRelation branded type
// ---------------------------------------------------------------------------

describe('InvalidRelation branded type', () => {
  it('produces readable relation error', () => {
    type Err = InvalidRelation<'bogus', 'author, comments'>;
    expectTypeOf<Err>().toEqualTypeOf<"ERROR: Relation 'bogus' does not exist. Available relations: author, comments.">();
  });
});

// ---------------------------------------------------------------------------
// ValidateKeys utility
// ---------------------------------------------------------------------------

describe('ValidateKeys', () => {
  it('passes through valid keys unchanged', () => {
    type Result = ValidateKeys<{ id: true; name: true }, 'id' | 'name' | 'email', 'users'>;
    expectTypeOf<Result>().toEqualTypeOf<{ id: true; name: true }>();
  });

  it('maps invalid keys to branded error type', () => {
    type Result = ValidateKeys<{ id: true; bogus: true }, 'id' | 'name' | 'email', 'users'>;
    // The 'bogus' key should be mapped to the error type
    expectTypeOf<Result['id']>().toEqualTypeOf<true>();
    expectTypeOf<Result['bogus']>().toEqualTypeOf<InvalidColumn<'bogus', 'users'>>();
  });
});

// ---------------------------------------------------------------------------
// SelectOption — existing type safety (positive + negative)
// ---------------------------------------------------------------------------

describe('SelectOption with existing types', () => {
  it('allows valid column names', () => {
    type UserSelect = SelectOption<typeof users._columns>;
    const _valid: UserSelect = { id: true, name: true };
    void _valid;
  });

  it('rejects invalid column names', () => {
    type UserSelect = SelectOption<typeof users._columns>;
    // @ts-expect-error — 'bogus' is not a column on users
    const _bad: UserSelect = { bogus: true };
    void _bad;
  });

  it('allows not: sensitive', () => {
    type UserSelect = SelectOption<typeof users._columns>;
    const _valid: UserSelect = { not: 'sensitive' };
    void _valid;
  });

  it('rejects combining not with explicit select', () => {
    type UserSelect = SelectOption<typeof users._columns>;
    // @ts-expect-error — cannot combine not with explicit field selection
    const _bad: UserSelect = { not: 'sensitive', id: true };
    void _bad;
  });
});

// ---------------------------------------------------------------------------
// FilterType — existing type safety (positive + negative)
// ---------------------------------------------------------------------------

describe('FilterType with existing types', () => {
  it('allows valid direct value filter', () => {
    type UserFilter = FilterType<typeof users._columns>;
    const _valid: UserFilter = { name: 'Alice' };
    void _valid;
  });

  it('allows valid operator filter', () => {
    type UserFilter = FilterType<typeof users._columns>;
    const _valid: UserFilter = { age: { gte: 18 } };
    void _valid;
  });

  it('rejects wrong value type', () => {
    type UserFilter = FilterType<typeof users._columns>;
    // @ts-expect-error — age is number | null, cannot use string
    const _bad: UserFilter = { age: 'not-a-number' };
    void _bad;
  });

  it('rejects non-existent column', () => {
    type UserFilter = FilterType<typeof users._columns>;
    // @ts-expect-error — nonExistent is not a column
    const _bad: UserFilter = { nonExistent: 'value' };
    void _bad;
  });
});
