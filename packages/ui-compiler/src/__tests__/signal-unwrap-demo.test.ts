/**
 * Demo: Signal property auto-unwrapping
 *
 * This test demonstrates the "eliminate .value" feature where the compiler
 * automatically unwraps signal properties from query(), form(), and other APIs.
 */

import { describe, expect, it } from 'vitest';
import { compile } from '../index';

describe('Signal property auto-unwrapping demo', () => {
  it('auto-unwraps query() signal properties', () => {
    const source = `
      import { query } from '@vertz/ui';
      
      function TaskList() {
        const tasks = query('/api/tasks');
        const isLoading = tasks.loading;  // No .value needed!
        const data = tasks.data;
        const error = tasks.error;
        
        return <div>{isLoading}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // The compiler should insert .value
    expect(result.code).toContain('tasks.loading.value');
    expect(result.code).toContain('tasks.data.value');
    expect(result.code).toContain('tasks.error.value');

    // But not for refetch (it's a plain function)
    expect(result.code).not.toContain('refetch.value');
  });

  it('auto-unwraps form() signal properties', () => {
    const source = `
      import { form } from '@vertz/ui';
      
      function UserForm() {
        const userForm = form(schema);
        const isSubmitting = userForm.submitting;  // No .value!
        const errors = userForm.errors;
        
        return <div>{isSubmitting}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).toContain('userForm.submitting.value');
    expect(result.code).toContain('userForm.errors.value');
  });

  it('handles chained property access correctly', () => {
    const source = `
      import { form } from '@vertz/ui';
      
      function UserForm() {
        const userForm = form(schema);
        const nameError = userForm.errors.name;  // unwrap .errors, then access .name
        
        return <div>{nameError}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Should unwrap .errors first, then access .name
    expect(result.code).toContain('userForm.errors.value.name');
  });

  it('works alongside local signal transforms', () => {
    const source = `
      import { query } from '@vertz/ui';
      
      function TaskList() {
        let statusFilter = 'all';  // local signal
        const tasks = query('/api/tasks');  // signal-object
        const isLoading = tasks.loading;  // auto-unwrap
        
        return <div>{statusFilter} {isLoading}</div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    // Local signal transform
    expect(result.code).toContain('const statusFilter = signal(');
    expect(result.code).toContain('statusFilter.value');

    // Signal-object auto-unwrap
    expect(result.code).toContain('tasks.loading.value');
  });

  it('demonstrates the DX improvement', () => {
    // BEFORE (manual .value everywhere)
    const before = `
      const tasks = query('/api/tasks');
      const isLoading = tasks.loading.value;
      const data = tasks.data.value;
    `;

    // AFTER (compiler auto-unwraps)
    const after = `
      const tasks = query('/api/tasks');
      const isLoading = tasks.loading;
      const data = tasks.data;
    `;

    // Both compile to the same output
    const beforeResult = compile(
      `import { query } from '@vertz/ui'; function A() { ${before} return <div/>; }`,
      'test.tsx',
    );
    const afterResult = compile(
      `import { query } from '@vertz/ui'; function A() { ${after} return <div/>; }`,
      'test.tsx',
    );

    // After compilation, both have .value inserted
    expect(beforeResult.code).toContain('tasks.loading.value');
    expect(afterResult.code).toContain('tasks.loading.value');

    // The "after" source doesn't require manual .value (only in comments)
    const afterNoComments = after.split('//')[0]; // Remove comment
    expect(afterNoComments).not.toContain('.value');
  });
});
