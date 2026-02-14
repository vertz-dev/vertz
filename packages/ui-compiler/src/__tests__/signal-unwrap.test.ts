/**
 * @file Tests for automatic signal property unwrapping from query(), form(), and createLoader()
 */
import { describe, expect, it } from 'bun:test';
import { compile } from '../compiler';

describe('Signal Auto-Unwrap', () => {
  it('should auto-unwrap .data property from query() result', () => {
    const source = `
      import { query } from '@vertz/ui';
      
      function TaskList() {
        const tasks = query('/api/tasks');
        const data = tasks.data;
        return <div>{data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should insert .value when accessing .data property
    expect(result.code).toContain('tasks.data.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should auto-unwrap .loading property from query() result', () => {
    const source = `
      import { query } from '@vertz/ui';
      
      function TaskList() {
        const tasks = query('/api/tasks');
        const isLoading = tasks.loading;
        return <div>{isLoading}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should insert .value when accessing .loading property
    expect(result.code).toContain('tasks.loading.value');
    expect(result.diagnostics).toHaveLength(0);
  });
});
