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

  it('should auto-unwrap multiple signal properties from query()', () => {
    const source = `
      import { query } from '@vertz/ui';

      function TaskList() {
        const tasks = query('/api/tasks');
        const data = tasks.data;
        const loading = tasks.loading;
        const error = tasks.error;
        return <div>{data} {loading} {error}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should insert .value for all three signal properties
    expect(result.code).toContain('tasks.data.value');
    expect(result.code).toContain('tasks.loading.value');
    expect(result.code).toContain('tasks.error.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should auto-unwrap signal properties from form()', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ name: '' });
        const submitting = taskForm.submitting;
        const errors = taskForm.errors;
        const values = taskForm.values;
        return <div>{submitting} {errors} {values}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should insert .value for all form signal properties
    expect(result.code).toContain('taskForm.submitting.value');
    expect(result.code).toContain('taskForm.errors.value');
    expect(result.code).toContain('taskForm.values.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should auto-unwrap signal properties from createLoader()', () => {
    const source = `
      import { createLoader } from '@vertz/ui';

      function TaskPage() {
        const loader = createLoader(() => fetch('/api/tasks'));
        const data = loader.data;
        const loading = loader.loading;
        const error = loader.error;
        return <div>{data} {loading} {error}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should insert .value for all loader signal properties
    expect(result.code).toContain('loader.data.value');
    expect(result.code).toContain('loader.loading.value');
    expect(result.code).toContain('loader.error.value');
    expect(result.diagnostics).toHaveLength(0);
  });
});
