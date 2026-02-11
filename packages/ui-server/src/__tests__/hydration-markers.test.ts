import { describe, expect, it } from 'vitest';
import { wrapWithHydrationMarkers } from '../hydration-markers';
import type { VNode } from '../types';

describe('wrapWithHydrationMarkers', () => {
  it('adds data-v-id and data-v-key to the root element', () => {
    const node: VNode = { tag: 'div', attrs: { class: 'counter' }, children: ['0'] };
    const result = wrapWithHydrationMarkers(node, {
      componentName: 'Counter',
      key: 'c-1',
    });
    expect(result.attrs['data-v-id']).toBe('Counter');
    expect(result.attrs['data-v-key']).toBe('c-1');
    // Preserves original attrs
    expect(result.attrs.class).toBe('counter');
  });

  it('embeds serialized props as a JSON script tag', () => {
    const node: VNode = { tag: 'div', attrs: {}, children: ['content'] };
    const result = wrapWithHydrationMarkers(node, {
      componentName: 'Greeting',
      key: 'g-1',
      props: { name: 'world', count: 42 },
    });

    // Should have the original children plus a script tag
    const scriptChild = result.children.find(
      (c) => typeof c !== 'string' && 'tag' in c && c.tag === 'script',
    ) as VNode | undefined;
    expect(scriptChild).toBeDefined();
    expect(scriptChild?.attrs.type).toBe('application/json');
    expect(scriptChild?.children).toEqual([JSON.stringify({ name: 'world', count: 42 })]);
  });

  it('does not add script tag when props is undefined', () => {
    const node: VNode = { tag: 'div', attrs: {}, children: ['content'] };
    const result = wrapWithHydrationMarkers(node, {
      componentName: 'Simple',
      key: 's-1',
    });

    const scriptChild = result.children.find(
      (c) => typeof c !== 'string' && 'tag' in c && c.tag === 'script',
    );
    expect(scriptChild).toBeUndefined();
  });

  it('does not mutate the original node', () => {
    const node: VNode = { tag: 'div', attrs: { class: 'original' }, children: ['text'] };
    wrapWithHydrationMarkers(node, {
      componentName: 'Test',
      key: 't-1',
      props: { a: 1 },
    });
    expect(node.attrs['data-v-id']).toBeUndefined();
    expect(node.children).toHaveLength(1);
  });
});
