import { describe, it, expect } from 'vitest';
import { LazySchema } from '../lazy';
import { StringSchema } from '../string';
import { ObjectSchema } from '../object';
import { NullableSchema } from '../../core/schema';

describe('LazySchema', () => {
  it('defers schema resolution until first use', () => {
    let called = false;
    const schema = new LazySchema(() => {
      called = true;
      return new StringSchema();
    });
    expect(called).toBe(false);
    schema.parse('hello');
    expect(called).toBe(true);
  });

  it('parses recursive structures (tree nodes)', () => {
    type TreeNode = { value: string; children: TreeNode | null };
    const treeSchema: ObjectSchema<TreeNode> = new ObjectSchema({
      value: new StringSchema(),
      children: new NullableSchema(new LazySchema(() => treeSchema)),
    });
    const data = {
      value: 'root',
      children: {
        value: 'child',
        children: null,
      },
    };
    const result = treeSchema.parse(data);
    expect(result.value).toBe('root');
    expect((result.children as TreeNode).value).toBe('child');
    expect((result.children as TreeNode).children).toBe(null);
  });

  it('toJSONSchema uses $ref for named lazy schemas', () => {
    type TreeNode = { value: string; children: TreeNode | null };
    const treeSchema: ObjectSchema<TreeNode> = new ObjectSchema({
      value: new StringSchema(),
      children: new NullableSchema(new LazySchema(() => treeSchema)),
    }).id('TreeNode') as ObjectSchema<TreeNode>;
    const jsonSchema = treeSchema.toJSONSchema();
    expect(jsonSchema.$defs).toBeDefined();
    expect(jsonSchema.$defs?.TreeNode).toBeDefined();
    expect(jsonSchema.$ref).toBe('#/$defs/TreeNode');
  });

  it('validates deeply nested recursive data', () => {
    type TreeNode = { value: string; children: TreeNode | null };
    const treeSchema: ObjectSchema<TreeNode> = new ObjectSchema({
      value: new StringSchema(),
      children: new NullableSchema(new LazySchema(() => treeSchema)),
    });
    const deepData = {
      value: 'level1',
      children: {
        value: 'level2',
        children: {
          value: 'level3',
          children: {
            value: 'level4',
            children: null,
          },
        },
      },
    };
    const result = treeSchema.parse(deepData);
    expect(((result.children as TreeNode).children as TreeNode).value).toBe('level3');
  });

  it('rejects invalid data in recursive structures', () => {
    type TreeNode = { value: string; children: TreeNode | null };
    const treeSchema: ObjectSchema<TreeNode> = new ObjectSchema({
      value: new StringSchema(),
      children: new NullableSchema(new LazySchema(() => treeSchema)),
    });
    const badData = {
      value: 'root',
      children: {
        value: 123, // should be string
        children: null,
      },
    };
    const result = treeSchema.safeParse(badData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['children', 'value']);
    }
  });
});
