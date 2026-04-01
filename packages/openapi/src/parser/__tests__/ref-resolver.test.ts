import { describe, expect, it } from 'bun:test';
import { resolveRef, resolveSchema } from '../ref-resolver';

describe('resolveRef', () => {
  it('resolves an internal component schema ref', () => {
    const document = {
      components: {
        schemas: {
          Task: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
    };

    expect(resolveRef('#/components/schemas/Task', document, { specVersion: '3.1' })).toEqual(
      document.components.schemas.Task,
    );
  });

  it('resolves nested ref chains', () => {
    const document = {
      components: {
        schemas: {
          A: { $ref: '#/components/schemas/B' },
          B: { $ref: '#/components/schemas/C' },
          C: { type: 'string' },
        },
      },
    };

    expect(
      resolveSchema({ $ref: '#/components/schemas/A' }, document, { specVersion: '3.1' }),
    ).toEqual({ type: 'string' });
  });

  it('returns a circular sentinel instead of recursing forever', () => {
    const document = {
      components: {
        schemas: {
          TreeNode: {
            type: 'object',
            properties: {
              child: { $ref: '#/components/schemas/TreeNode' },
            },
          },
        },
      },
    };

    expect(
      resolveSchema({ $ref: '#/components/schemas/TreeNode' }, document, { specVersion: '3.1' }),
    ).toEqual({
      type: 'object',
      properties: {
        child: { $circular: 'TreeNode' },
      },
    });
  });

  it('throws for external refs with an actionable error', () => {
    expect(() => resolveRef('./models/task.yaml', {}, { specVersion: '3.1' })).toThrow(
      'External $ref values are not supported',
    );
  });

  it('merges allOf members into one flattened schema', () => {
    const document = {
      components: {
        schemas: {
          TaskBase: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
            required: ['id'],
          },
        },
      },
    };

    expect(
      resolveSchema(
        {
          allOf: [
            { $ref: '#/components/schemas/TaskBase' },
            {
              type: 'object',
              properties: {
                title: { type: 'string' },
              },
              required: ['title'],
            },
          ],
        },
        document,
        { specVersion: '3.1' },
      ),
    ).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['id', 'title'],
    });
  });

  it('ignores sibling keywords next to $ref in 3.0 mode', () => {
    const document = {
      components: {
        schemas: {
          Task: { type: 'string' },
        },
      },
    };

    expect(
      resolveSchema(
        {
          $ref: '#/components/schemas/Task',
          description: 'ignored',
        },
        document,
        { specVersion: '3.0' },
      ),
    ).toEqual({ type: 'string' });
  });

  it('merges sibling keywords next to $ref in 3.1 mode', () => {
    const document = {
      components: {
        schemas: {
          Task: { type: 'string' },
        },
      },
    };

    expect(
      resolveSchema(
        {
          $ref: '#/components/schemas/Task',
          description: 'kept',
        },
        document,
        { specVersion: '3.1' },
      ),
    ).toEqual({
      type: 'string',
      description: 'kept',
    });
  });
});
