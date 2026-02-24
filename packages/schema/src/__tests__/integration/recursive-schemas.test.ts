import { describe, expect, it } from 'bun:test';
import type { Infer } from '../..';
import { s } from '../..';

describe('Integration: Recursive Schemas', () => {
  it('tree node with s.lazy() and .id()', () => {
    const treeSchema = s
      .object({
        value: s.string(),
        children: s.lazy(() => treeSchema).nullable(),
      })
      .id('TreeNodeIntegration');

    type _TreeNode = Infer<typeof treeSchema>;

    const data = {
      value: 'root',
      children: {
        value: 'child',
        children: null,
      },
    };
    const result = treeSchema.parse(data);
    expect(result.value).toBe('root');
  });

  it('parses deeply nested tree structure', () => {
    const treeSchema = s.object({
      value: s.number(),
      left: s.lazy(() => treeSchema).nullable(),
      right: s.lazy(() => treeSchema).nullable(),
    });

    const bst = {
      value: 10,
      left: {
        value: 5,
        left: { value: 2, left: null, right: null },
        right: { value: 7, left: null, right: null },
      },
      right: {
        value: 15,
        left: null,
        right: { value: 20, left: null, right: null },
      },
    };

    const result = treeSchema.parse(bst);
    expect(result.value).toBe(10);
  });

  it('JSON Schema output with $ref for recursive schema', () => {
    const nodeSchema = s
      .object({
        name: s.string(),
        children: s.array(s.lazy(() => nodeSchema)),
      })
      .id('RecursiveNode');

    const jsonSchema = nodeSchema.toJSONSchema();
    expect(jsonSchema.$ref).toBe('#/$defs/RecursiveNode');
    expect(jsonSchema.$defs?.RecursiveNode).toBeDefined();
    // Should not hang or stack overflow
  });
});
