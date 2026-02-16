/**
 * Type-level tests for QueryResult and query().
 *
 * These tests verify that generic type parameters flow correctly
 * through the query API. They are checked by `tsc --noEmit`
 * (typecheck), not by vitest at runtime.
 */
import { query } from '../query';

const _data = result.data;
void _data;
const _dataValue = result.data.value;
void _dataValue;
// loading is ReadonlySignal<boolean>
const _loading = result.loading;
void _loading;
const _loadingValue = result.loading.value;
void _loadingValue;
// error is ReadonlySignal<unknown>
const _error = result.error;
void _error;
// refetch returns void
const _refetchResult = result.refetch();
void _refetchResult;
// revalidate returns void
const _revalidateResult = result.revalidate();
void _revalidateResult;
// dispose returns void
const _disposeResult = result.dispose();
void _disposeResult;
// ─── query() — generic inference from thunk ───────────────────────
// query() infers T from the thunk return type
const stringQuery = query(() => Promise.resolve('hello'));
const _strData = stringQuery.data;
void _strData;
const userQuery = query(async () => ({ id: 1, name: 'Alice' }));
const _userData = userQuery.data;
void _userData;
// Accessing properties on the data value
const _userDataVal = userQuery.data.value;
if (_userDataVal) {
  const _id = _userDataVal.id;
  const _name = _userDataVal.name;
  void _id;
  void _name;
}
// ─── query() — initialData type safety ────────────────────────────
// initialData must match the thunk return type
const _withInitial = query(() => Promise.resolve(42), { initialData: 0 });
void _withInitial;
// @ts-expect-error - initialData type mismatch (string vs number)
const _badInitial = query(() => Promise.resolve(42), { initialData: 'wrong' });
void _badInitial;
// ─── QueryOptions<T> — type constraint ────────────────────────────
// Valid options
const _validOpts = {
  initialData: 42,
  debounce: 300,
  enabled: true,
  key: 'my-key',
};
void _validOpts;
const _badOpts = {
  // @ts-expect-error - initialData type must match T
  initialData: 'not a number',
};
void _badOpts;
// @ts-expect-error - data is readonly, cannot reassign
readonlyCheck.data = null;
// @ts-expect-error - loading is readonly, cannot reassign
readonlyCheck.loading = null;
// @ts-expect-error - error is readonly, cannot reassign
readonlyCheck.error = null;
const paginatedQuery = query(async () => ({
  data: [{ id: 1, name: 'Alice' }],
  meta: { page: 1, total: 100 },
}));
const _paginatedData = paginatedQuery.data;
void _paginatedData;
const _paginatedVal = paginatedQuery.data.value;
if (_paginatedVal) {
  const _users = _paginatedVal.data;
  const _page = _paginatedVal.meta.page;
  void _users;
  void _page;
}
//# sourceMappingURL=query.test-d.js.map
