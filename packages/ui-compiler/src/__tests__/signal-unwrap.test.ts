/**
 * @file Tests for automatic signal property unwrapping from query(), form(), and createLoader()
 */
import { describe, expect, it } from 'vitest';
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
        const dirty = taskForm.dirty;
        const valid = taskForm.valid;
        return <div>{submitting} {dirty} {valid}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should insert .value for all form signal properties
    expect(result.code).toContain('taskForm.submitting.value');
    expect(result.code).toContain('taskForm.dirty.value');
    expect(result.code).toContain('taskForm.valid.value');
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

  it('should handle aliased imports', () => {
    const source = `
      import { query as fetchData } from '@vertz/ui';

      function TaskList() {
        const tasks = fetchData('/api/tasks');
        const data = tasks.data;
        return <div>{data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should still auto-unwrap even with aliased import
    expect(result.code).toContain('tasks.data.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should not auto-unwrap plain (non-signal) properties', () => {
    const source = `
      import { query } from '@vertz/ui';

      function TaskList() {
        const tasks = query('/api/tasks');
        const refetch = tasks.refetch;
        return <button onClick={refetch}>Refetch</button>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should NOT insert .value for plain properties like refetch
    expect(result.code).toContain('tasks.refetch');
    expect(result.code).not.toContain('tasks.refetch.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should auto-unwrap signal property used directly in JSX attribute', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form(someMethod, { schema: someSchema });
        return <button disabled={taskForm.submitting}>Submit</button>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should insert .value when signal property is used inline in JSX attribute
    expect(result.code).toContain('taskForm.submitting.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should auto-unwrap signal property used directly in JSX expression', () => {
    const source = `
      import { query } from '@vertz/ui';

      function TaskList() {
        const tasks = query('/api/tasks');
        return <div>{tasks.loading && <span>Loading...</span>}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should insert .value when signal property is used inline in JSX expression
    expect(result.code).toContain('tasks.loading.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should generate reactive __attr for signal property in JSX attribute', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form(someMethod, { schema: someSchema });
        return <button disabled={taskForm.submitting}>Submit</button>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Signal API property in JSX attribute must be reactive (use __attr, not setAttribute)
    expect(result.code).toContain('__attr(');
    expect(result.code).toContain('taskForm.submitting.value');
    expect(result.code).not.toContain('setAttribute("disabled"');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should mark 3-level field signal property in JSX child as reactive', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ title: '' });
        return <div>{taskForm.title.error}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // 3-level field signal property in JSX child must be reactive (uses __child)
    expect(result.code).toContain('__child(');
    expect(result.code).toContain('taskForm.title.error.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should mark 3-level field signal property in JSX attribute as reactive', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ title: '' });
        return <input disabled={taskForm.title.error} />;
      }
    `;

    const result = compile(source, 'test.tsx');

    // 3-level field signal property in JSX attribute must be reactive (uses __attr)
    expect(result.code).toContain('__attr(');
    expect(result.code).toContain('taskForm.title.error.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should mark 3-level field signal property in logical AND as reactive', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ title: '' });
        return <div>{taskForm.title.error && <span>Error</span>}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // 3-level field signal in logical AND must be reactive (uses __conditional)
    expect(result.code).toContain('__conditional(');
    expect(result.code).toContain('taskForm.title.error.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should NOT mark field name alone in JSX as reactive', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ title: '' });
        return <div>{taskForm.title}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Middle accessor alone (field name) is NOT a signal — should not be reactive
    expect(result.code).not.toContain('__child(');
    expect(result.code).toContain('__insert(');
    expect(result.code).not.toContain('taskForm.title.value');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should classify const derived from query signal property as computed', () => {
    const source = `
      import { query } from '@vertz/ui';

      function TaskList() {
        const tasks = query('/api/tasks');
        const errorMsg = tasks.error ? 'Error!' : '';
        return <div>{errorMsg}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // errorMsg should be wrapped in computed()
    expect(result.code).toContain('computed(() =>');
    // Signal auto-unwrap should insert .value
    expect(result.code).toContain('tasks.error.value');
    // JSX usage should be reactive
    expect(result.code).toContain('__child(');
    // No effect() bridges needed
    expect(result.code).not.toContain('effect(');
    expect(result.diagnostics).toHaveLength(0);
  });

  describe('Destructured Signal API', () => {
    it('should emit synthetic var + computed bindings for destructured query()', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskList() {
          const { data, loading, error } = query('/api/tasks');
          return <div>{data}</div>;
        }
      `;

      const result = compile(source, 'test.tsx');

      expect(result.code).toContain("const __query_0 = query('/api/tasks')");
      expect(result.code).toContain('const data = computed(() => __query_0.data.value)');
      expect(result.code).toContain('const loading = computed(() => __query_0.loading.value)');
      expect(result.code).toContain('const error = computed(() => __query_0.error.value)');
      expect(result.code).toContain('__child(');
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should keep plain properties static for destructured query()', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskList() {
          const { data, refetch } = query('/api/tasks');
          return <div>{data}</div>;
        }
      `;

      const result = compile(source, 'test.tsx');

      expect(result.code).toContain('const data = computed(() => __query_0.data.value)');
      expect(result.code).toContain('const refetch = __query_0.refetch');
      expect(result.code).not.toContain('computed(() => __query_0.refetch');
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should handle destructured form()', () => {
      const source = `
        import { form } from '@vertz/ui';

        function TaskForm() {
          const { submitting, action } = form({ name: '' });
          return <button disabled={submitting}>Submit</button>;
        }
      `;

      const result = compile(source, 'test.tsx');

      expect(result.code).toContain('const __form_0 = form(');
      expect(result.code).toContain('const submitting = computed(() => __form_0.submitting.value)');
      expect(result.code).toContain('const action = __form_0.action');
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should handle renamed properties in destructuring', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskList() {
          const { data: tasks } = query('/api/tasks');
          return <div>{tasks}</div>;
        }
      `;

      const result = compile(source, 'test.tsx');

      expect(result.code).toContain('const tasks = computed(() => __query_0.data.value)');
      expect(result.code).toContain('__child(');
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should handle aliased signal API imports in destructuring', () => {
      const source = `
        import { query as fetchData } from '@vertz/ui';

        function TaskList() {
          const { data } = fetchData('/api/tasks');
          return <div>{data}</div>;
        }
      `;

      const result = compile(source, 'test.tsx');

      expect(result.code).toContain("const __query_0 = fetchData('/api/tasks')");
      expect(result.code).toContain('const data = computed(() => __query_0.data.value)');
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should handle destructured signal prop in direct JSX attribute', () => {
      const source = `
        import { form } from '@vertz/ui';

        function TaskForm() {
          const { submitting } = form({ name: '' });
          return <button disabled={submitting}>Submit</button>;
        }
      `;

      const result = compile(source, 'test.tsx');

      expect(result.code).toContain('const submitting = computed(() => __form_0.submitting.value)');
      expect(result.code).toContain('__attr(');
      expect(result.code).toContain('submitting.value');
      expect(result.diagnostics).toHaveLength(0);
    });
  });

  describe('Destructured Signal API Edge Cases', () => {
    it('should handle partial destructuring (only some props)', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskList() {
          const { data } = query('/api/tasks');
          return <div>{data}</div>;
        }
      `;

      const result = compile(source, 'test.tsx');

      expect(result.code).toContain("const __query_0 = query('/api/tasks')");
      expect(result.code).toContain('const data = computed(() => __query_0.data.value)');
      expect(result.code).not.toContain('loading');
      expect(result.code).not.toContain('error');
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should not break non-signal-API destructuring (regression)', () => {
      const source = `
        function Profile() {
          let user = { name: 'Alice', age: 30 };
          const { name, age } = user;
          return <div>{name} - {age}</div>;
        }
      `;

      const result = compile(source, 'test.tsx');

      // Regular destructuring should still work as before — no synthetic variable
      expect(result.code).toContain('computed(() => user.value.name)');
      expect(result.code).toContain('computed(() => user.value.age)');
      expect(result.code).not.toContain('__query_');
      expect(result.code).not.toContain('__form_');
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should generate unique synthetic names for multiple destructured signal APIs', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskList() {
          const { data: tasks } = query('/api/tasks');
          const { data: users } = query('/api/users');
          return <div>{tasks} {users}</div>;
        }
      `;

      const result = compile(source, 'test.tsx');

      expect(result.code).toContain('const __query_0 =');
      expect(result.code).toContain('const __query_1 =');
      expect(result.code).toContain('const tasks = computed(() => __query_0.data.value)');
      expect(result.code).toContain('const users = computed(() => __query_1.data.value)');
      expect(result.diagnostics).toHaveLength(0);
    });
  });

  it('should NOT double-unwrap when .value already exists (migration case)', () => {
    const source = `
      import { query } from '@vertz/ui';
      
      function TaskList() {
        const tasks = query('/api/tasks');
        const data = tasks.data.value; // Old style, already has .value
        return <div>{data}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should NOT become tasks.data.value.value
    expect(result.code).toContain('tasks.data.value');
    expect(result.code).not.toContain('tasks.data.value.value');
    expect(result.diagnostics).toHaveLength(0);
  });
});
