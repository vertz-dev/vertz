import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../d';

// ---------------------------------------------------------------------------
// Fixture tables
// ---------------------------------------------------------------------------
const _users = d.table('users', {
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
    expectTypeOf().toEqualTypeOf();
  });
  it('produces error for different table names', () => {
    expectTypeOf().toEqualTypeOf();
  });
});
// ---------------------------------------------------------------------------
// InvalidFilterType branded type
// ---------------------------------------------------------------------------
describe('InvalidFilterType branded type', () => {
  it('produces readable filter error', () => {
    expectTypeOf().toEqualTypeOf();
  });
});
// ---------------------------------------------------------------------------
// InvalidRelation branded type
// ---------------------------------------------------------------------------
describe('InvalidRelation branded type', () => {
  it('produces readable relation error', () => {
    expectTypeOf().toEqualTypeOf();
  });
});
// ---------------------------------------------------------------------------
// ValidateKeys utility
// ---------------------------------------------------------------------------
describe('ValidateKeys', () => {
  it('passes through valid keys unchanged', () => {
    expectTypeOf().toEqualTypeOf();
  });
  it('maps invalid keys to branded error type', () => {
    // The 'bogus' key should be mapped to the error type
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
});
// ---------------------------------------------------------------------------
// SelectOption — existing type safety (positive + negative)
// ---------------------------------------------------------------------------
describe('SelectOption with existing types', () => {
  it('allows valid column names', () => {
    const _valid = { id: true, name: true };
    void _valid;
  });
  it('rejects invalid column names', () => {
    // @ts-expect-error — 'bogus' is not a column on users
    const _bad = { bogus: true };
    void _bad;
  });
  it('allows not: sensitive', () => {
    const _valid = { not: 'sensitive' };
    void _valid;
  });
  it('rejects combining not with explicit select', () => {
    // @ts-expect-error — cannot combine not with explicit field selection
    const _bad = { not: 'sensitive', id: true };
    void _bad;
  });
});
// ---------------------------------------------------------------------------
// FilterType — existing type safety (positive + negative)
// ---------------------------------------------------------------------------
describe('FilterType with existing types', () => {
  it('allows valid direct value filter', () => {
    const _valid = { name: 'Alice' };
    void _valid;
  });
  it('allows valid operator filter', () => {
    const _valid = { age: { gte: 18 } };
    void _valid;
  });
  it('rejects wrong value type', () => {
    // @ts-expect-error — age is number | null, cannot use string
    const _bad = { age: 'not-a-number' };
    void _bad;
  });
  it('rejects non-existent column', () => {
    // @ts-expect-error — nonExistent is not a column
    const _bad = { nonExistent: 'value' };
    void _bad;
  });
});
//# sourceMappingURL=type-errors.test-d.js.map
