/**
 * @file Tests for automatic thunk wrapping of query() arguments with reactive deps.
 *
 * When query() receives a non-function argument (e.g., a descriptor from
 * api.entity.list({...})) and that argument contains reactive variable
 * references, the compiler should auto-wrap it in an arrow function so
 * the reactive deps are tracked inside the effect. (#1861)
 */
import { describe, expect, it } from 'bun:test';
import { compile } from '../compiler';

describe('query() auto-thunk transform (#1861)', () => {
  it('wraps descriptor argument in thunk when it contains reactive deps', () => {
    const source = `
      import { query } from '@vertz/ui';

      function BrandsPage() {
        let page = 1;
        const offset = (page - 1) * 20;
        const brands = query(api.brands.list({ limit: 20, offset: offset }));
        return <div>{brands.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // The descriptor argument should be wrapped in an arrow function
    // so that offset.value is read inside the effect's tracking context.
    expect(result.code).toContain('query(() => api.brands.list(');
    expect(result.code).toContain('offset: offset.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('does NOT wrap when argument is already a thunk', () => {
    const source = `
      import { query } from '@vertz/ui';

      function BrandsPage() {
        let page = 1;
        const offset = (page - 1) * 20;
        const brands = query(() => api.brands.list({ limit: 20, offset: offset }));
        return <div>{brands.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should NOT double-wrap: no `() => () =>`
    expect(result.code).not.toContain('() => () =>');
    // Should still have the thunk
    expect(result.code).toContain('query(() => api.brands.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('does NOT wrap when argument has no reactive deps', () => {
    const source = `
      import { query } from '@vertz/ui';

      function BrandsPage() {
        const brands = query(api.brands.list({ limit: 20 }));
        return <div>{brands.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // No reactive deps → no thunk wrapping needed
    expect(result.code).not.toContain('query(() =>');
    expect(result.code).toContain('query(api.brands.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('wraps when argument contains a signal variable directly', () => {
    const source = `
      import { query } from '@vertz/ui';

      function SearchPage() {
        let searchTerm = '';
        const results = query(api.search({ q: searchTerm }));
        return <div><input value={searchTerm} />{results.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).toContain('query(() => api.search(');
    expect(result.code).toContain('q: searchTerm.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('wraps when argument contains a computed variable', () => {
    const source = `
      import { query } from '@vertz/ui';

      function FilteredList() {
        let status = 'active';
        const filter = status === 'all' ? undefined : status;
        const tasks = query(api.tasks.list({ status: filter }));
        return <div>{tasks.data}<button onClick={() => { status = 'all'; }}>All</button></div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).toContain('query(() => api.tasks.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('preserves options as second argument after wrapping', () => {
    const source = `
      import { query } from '@vertz/ui';

      function BrandsPage() {
        let page = 1;
        const offset = (page - 1) * 20;
        const brands = query(api.brands.list({ offset: offset }), { ssrTimeout: 500 });
        return <div>{brands.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should wrap only the first arg, keep options intact
    expect(result.code).toContain('query(() => api.brands.list(');
    expect(result.code).toContain('{ ssrTimeout: 500 }');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('wraps when reactive dep appears as shorthand property', () => {
    const source = `
      import { query } from '@vertz/ui';

      function BrandsPage() {
        let page = 1;
        const offset = (page - 1) * 20;
        const brands = query(api.brands.list({ offset }));
        return <div>{brands.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Shorthand { offset } references the computed variable — should trigger wrapping
    expect(result.code).toContain('query(() => api.brands.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('works with aliased query import', () => {
    const source = `
      import { query as q } from '@vertz/ui';

      function BrandsPage() {
        let page = 1;
        const offset = (page - 1) * 20;
        const brands = q(api.brands.list({ offset: offset }));
        return <div>{brands.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).toContain('q(() => api.brands.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('wraps when argument contains a useSearchParams() reactive source property', () => {
    const source = `
      import { query, useSearchParams } from '@vertz/ui';

      function TaskListPage() {
        const sp = useSearchParams();
        const tasks = query(api.tasks.list({ page: sp.page }));
        return <div>{tasks.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // sp is a reactive source — auto-thunk must wrap the arg
    expect(result.code).toContain('query(() => api.tasks.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('wraps when reactive source is the ONLY reactive thing (no signals/computeds)', () => {
    const source = `
      import { query, useSearchParams } from '@vertz/ui';

      function TaskListPage() {
        const sp = useSearchParams();
        const tasks = query(api.tasks.list({ page: sp.page, limit: 10 }));
        return <div>{tasks.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // No let signals, no derived computeds — only the reactive source.
    // The outer guard in compiler.ts and the transformer filter both must
    // account for reactive sources.
    expect(result.code).toContain('query(() => api.tasks.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('wraps when argument contains a useContext() reactive source property', () => {
    const source = `
      import { query, useContext } from '@vertz/ui';

      function FilteredList() {
        const ctx = useContext(SettingsCtx);
        const items = query(api.items.list({ locale: ctx.locale }));
        return <div>{items.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).toContain('query(() => api.items.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('wraps when argument contains a useAuth() reactive source property', () => {
    const source = `
      import { query, useAuth } from '@vertz/ui';

      function UserItems() {
        const auth = useAuth();
        const items = query(api.items.list({ userId: auth.userId }));
        return <div>{items.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).toContain('query(() => api.items.list(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('does NOT wrap when reactive source is not referenced in query arg', () => {
    const source = `
      import { query, useSearchParams } from '@vertz/ui';

      function TaskListPage() {
        const sp = useSearchParams();
        const tasks = query(api.tasks.list({ limit: 20 }));
        return <div>{sp.page}{tasks.data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // sp is used in JSX but NOT in the query arg — no wrapping needed
    expect(result.code).not.toContain('query(() =>');
    expect(result.code).toContain('query(api.tasks.list(');
    expect(result.diagnostics).toHaveLength(0);
  });
});
