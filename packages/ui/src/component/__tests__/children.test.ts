import { describe, expect, test } from 'bun:test';
import type { ChildrenAccessor } from '../children';
import { children, resolveChildren } from '../children';

describe('children', () => {
  test('returns a getter that resolves a single child node', () => {
    const el = document.createElement('div');
    const accessor: ChildrenAccessor = () => el;
    const resolved = children(accessor);
    expect(resolved()).toEqual([el]);
  });

  test('returns a getter that resolves an array of child nodes', () => {
    const a = document.createElement('span');
    const b = document.createElement('span');
    const accessor: ChildrenAccessor = () => [a, b];
    const resolved = children(accessor);
    expect(resolved()).toEqual([a, b]);
  });

  test('flattens nested arrays', () => {
    const a = document.createElement('span');
    const b = document.createElement('span');
    const c = document.createElement('span');
    const accessor: ChildrenAccessor = () => [a, [b, c]];
    const resolved = children(accessor);
    expect(resolved()).toEqual([a, b, c]);
  });

  test('filters out null and undefined', () => {
    const a = document.createElement('span');
    const accessor: ChildrenAccessor = () => [null, a, undefined];
    const resolved = children(accessor);
    expect(resolved()).toEqual([a]);
  });

  test('handles string children as text nodes', () => {
    const accessor: ChildrenAccessor = () => 'hello';
    const resolved = children(accessor);
    const result = resolved();
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Text);
    expect((result[0] as Text).textContent).toBe('hello');
  });

  test('handles number children as text nodes', () => {
    const accessor: ChildrenAccessor = () => 42;
    const resolved = children(accessor);
    const result = resolved();
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Text);
    expect((result[0] as Text).textContent).toBe('42');
  });
});

describe('resolveChildren', () => {
  test('resolves a single node', () => {
    const el = document.createElement('div');
    expect(resolveChildren(el)).toEqual([el]);
  });

  test('resolves null to empty array', () => {
    expect(resolveChildren(null)).toEqual([]);
  });

  test('resolves undefined to empty array', () => {
    expect(resolveChildren(undefined)).toEqual([]);
  });

  test('resolves mixed array with filtering and flattening', () => {
    const a = document.createElement('span');
    const b = document.createElement('span');
    const result = resolveChildren([null, a, [b, undefined], 'text']);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
    expect(result[2]).toBeInstanceOf(Text);
  });
});
