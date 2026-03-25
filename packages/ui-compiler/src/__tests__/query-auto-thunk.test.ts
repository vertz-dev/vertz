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
});
