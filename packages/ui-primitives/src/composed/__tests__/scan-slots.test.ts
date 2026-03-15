import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { scanSlots } from '../scan-slots';

describe('scanSlots', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('finds a slot element by data-slot attribute', () => {
    const marker = document.createElement('div');
    marker.dataset.slot = 'trigger';

    const btn = document.createElement('button');
    btn.textContent = 'Click';
    marker.appendChild(btn);

    const result = scanSlots([marker]);

    expect(result.slots.get('trigger')).toHaveLength(1);
    expect(result.slots.get('trigger')![0].element).toBe(marker);
  });

  it('extracts children from slot marker', () => {
    const marker = document.createElement('div');
    marker.dataset.slot = 'content';

    const title = document.createElement('h2');
    title.textContent = 'Title';
    const desc = document.createElement('p');
    desc.textContent = 'Description';
    marker.appendChild(title);
    marker.appendChild(desc);

    const result = scanSlots([marker]);
    const entry = result.slots.get('content')![0];

    expect(entry.children).toHaveLength(2);
    expect(entry.children[0]).toBe(title);
    expect(entry.children[1]).toBe(desc);
  });

  it('collects multiple entries for the same slot name', () => {
    const item1 = document.createElement('div');
    item1.dataset.slot = 'item';
    item1.dataset.value = 'a';

    const item2 = document.createElement('div');
    item2.dataset.slot = 'item';
    item2.dataset.value = 'b';

    const result = scanSlots([item1, item2]);

    expect(result.slots.get('item')).toHaveLength(2);
    expect(result.slots.get('item')![0].attrs.value).toBe('a');
    expect(result.slots.get('item')![1].attrs.value).toBe('b');
  });

  it('puts non-slot nodes in rest', () => {
    const text = document.createTextNode('plain text');
    const div = document.createElement('div');
    const marker = document.createElement('span');
    marker.dataset.slot = 'trigger';

    const result = scanSlots([text, div, marker]);

    expect(result.rest).toHaveLength(2);
    expect(result.rest[0]).toBe(text);
    expect(result.rest[1]).toBe(div);
    expect(result.slots.get('trigger')).toHaveLength(1);
  });

  it('collects data-* attributes excluding data-slot', () => {
    const marker = document.createElement('div');
    marker.dataset.slot = 'trigger';
    marker.dataset.value = 'tab-1';
    marker.dataset.variant = 'line';

    const result = scanSlots([marker]);
    const entry = result.slots.get('trigger')![0];

    expect(entry.attrs.value).toBe('tab-1');
    expect(entry.attrs.variant).toBe('line');
    expect(entry.attrs.slot).toBeUndefined();
  });

  it('returns empty map and all nodes as rest when no slots exist', () => {
    const div = document.createElement('div');
    const span = document.createElement('span');

    const result = scanSlots([div, span]);

    expect(result.slots.size).toBe(0);
    expect(result.rest).toHaveLength(2);
  });
});
