import { describe, expect, it } from 'vitest';
import { serializeToHtml } from '../html-serializer';
import { createSlotPlaceholder, resetSlotCounter } from '../slot-placeholder';

describe('createSlotPlaceholder', () => {
  it('creates a placeholder with v-slot-N id', () => {
    resetSlotCounter();
    const placeholder = createSlotPlaceholder({
      tag: 'span',
      attrs: {},
      children: ['Loading...'],
    });
    expect(placeholder.tag).toBe('div');
    expect(placeholder.attrs.id).toBe('v-slot-0');
    expect(serializeToHtml(placeholder)).toBe('<div id="v-slot-0"><span>Loading...</span></div>');
  });

  it('increments the slot counter', () => {
    resetSlotCounter();
    const p1 = createSlotPlaceholder({ tag: 'span', attrs: {}, children: ['a'] });
    const p2 = createSlotPlaceholder({ tag: 'span', attrs: {}, children: ['b'] });
    expect(p1.attrs.id).toBe('v-slot-0');
    expect(p2.attrs.id).toBe('v-slot-1');
  });

  it('wraps fallback content inside the placeholder div', () => {
    resetSlotCounter();
    const fallback = { tag: 'div', attrs: { class: 'skeleton' }, children: ['...'] } as const;
    const placeholder = createSlotPlaceholder(fallback);
    expect(placeholder.children).toHaveLength(1);
    expect(placeholder.children[0]).toEqual(fallback);
  });
});
