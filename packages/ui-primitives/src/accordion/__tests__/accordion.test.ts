import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Accordion } from '../accordion';

describe('Accordion', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates accordion with sections', () => {
    const { root, Item } = Accordion.Root();
    container.appendChild(root);
    const { trigger, content } = Item('section1');

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(content.getAttribute('role')).toBe('region');
    expect(content.getAttribute('aria-labelledby')).toBe(trigger.id);
  });

  it('expands section on trigger click', () => {
    const { root, state, Item } = Accordion.Root();
    container.appendChild(root);
    const { trigger, content } = Item('section1');

    trigger.click();
    expect(state.value.peek()).toContain('section1');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('collapses section on second click', () => {
    const { root, state, Item } = Accordion.Root();
    container.appendChild(root);
    const { trigger, content } = Item('section1');

    trigger.click();
    trigger.click();

    expect(state.value.peek()).not.toContain('section1');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('single mode: only one section open at a time', () => {
    const { root, state, Item } = Accordion.Root({ multiple: false });
    container.appendChild(root);
    const { trigger: t1 } = Item('s1');
    const { trigger: t2 } = Item('s2');

    t1.click();
    expect(state.value.peek()).toEqual(['s1']);

    t2.click();
    expect(state.value.peek()).toEqual(['s2']);
  });

  it('multiple mode: multiple sections can be open', () => {
    const { root, state, Item } = Accordion.Root({ multiple: true });
    container.appendChild(root);
    const { trigger: t1 } = Item('s1');
    const { trigger: t2 } = Item('s2');

    t1.click();
    t2.click();
    expect(state.value.peek()).toEqual(['s1', 's2']);
  });

  it('supports defaultValue', () => {
    const { root, Item } = Accordion.Root({ defaultValue: ['s1'] });
    container.appendChild(root);
    const { trigger, content } = Item('s1');

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
  });

  it('calls onValueChange', () => {
    const onValueChange = vi.fn();
    const { root, Item } = Accordion.Root({ onValueChange });
    container.appendChild(root);
    const { trigger } = Item('s1');

    trigger.click();
    expect(onValueChange).toHaveBeenCalledWith(['s1']);
  });

  it('navigates with ArrowDown between triggers', () => {
    const { root, Item } = Accordion.Root();
    container.appendChild(root);
    const { trigger: t1 } = Item('s1');
    const { trigger: t2 } = Item('s2');

    t1.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(t2);
  });
});
