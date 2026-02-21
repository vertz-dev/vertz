/**
 * @file Tests for __bindElement transform on form elements
 */
import { describe, expect, it } from 'vitest';
import { compile } from '../compiler';

describe('__bindElement transform', () => {
  it('should add __bindElement when form tag has onSubmit from form variable', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ title: '' });
        return <form onSubmit={taskForm.onSubmit}><button>Submit</button></form>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).toContain('taskForm.__bindElement(');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should NOT add __bindElement when handler is a regular function', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ title: '' });
        const handler = () => {};
        return <form onSubmit={handler}><button>Submit</button></form>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).not.toContain('__bindElement');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should NOT add __bindElement when tag is not form', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ title: '' });
        return <div onSubmit={taskForm.onSubmit}><button>Submit</button></div>;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).not.toContain('__bindElement');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should add __bindElement for self-closing form tag', () => {
    const source = `
      import { form } from '@vertz/ui';

      function TaskForm() {
        const taskForm = form({ title: '' });
        return <form onSubmit={taskForm.onSubmit} />;
      }
    `;

    const result = compile(source, 'test.tsx');

    expect(result.code).toContain('taskForm.__bindElement(');
    expect(result.diagnostics).toHaveLength(0);
  });
});
