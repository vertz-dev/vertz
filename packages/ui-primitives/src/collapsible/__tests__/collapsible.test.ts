import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Collapsible } from '../collapsible';

describe('Collapsible', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates with aria-expanded="false" by default', () => {
    const { trigger } = Collapsible.Root();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('content is aria-hidden="true" and display:none by default', () => {
    const { content } = Collapsible.Root();
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.style.display).toBe('none');
  });

  it('data-state="closed" on trigger and content by default', () => {
    const { trigger, content } = Collapsible.Root();
    expect(trigger.getAttribute('data-state')).toBe('closed');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('aria-controls on trigger matches content id', () => {
    const { trigger, content } = Collapsible.Root();
    expect(trigger.getAttribute('aria-controls')).toBe(content.id);
  });

  it('click trigger opens: aria-expanded="true", content visible, data-state="open"', () => {
    const { root, trigger, content, state } = Collapsible.Root();
    container.appendChild(root);

    trigger.click();
    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('click again closes with animation', () => {
    const { root, trigger, content, state } = Collapsible.Root();
    container.appendChild(root);

    trigger.click();
    trigger.click();

    expect(state.open.peek()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('data-state')).toBe('closed');
    expect(content.getAttribute('data-state')).toBe('closed');
    // aria-hidden set immediately for screen readers
    expect(content.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaultOpen: starts open', () => {
    const { trigger, content, state } = Collapsible.Root({ defaultOpen: true });
    expect(state.open.peek()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('disabled: no toggle on click', () => {
    const { root, trigger, state } = Collapsible.Root({ disabled: true });
    container.appendChild(root);

    trigger.click();
    expect(state.open.peek()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
  });

  it('onOpenChange callback called with correct value', () => {
    const onOpenChange = vi.fn();
    const { root, trigger } = Collapsible.Root({ onOpenChange });
    container.appendChild(root);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('sets --collapsible-content-height CSS var', () => {
    const { root, trigger, content } = Collapsible.Root();
    container.appendChild(root);

    trigger.click();
    const heightVar = content.style.getPropertyValue('--collapsible-content-height');
    expect(heightVar).toMatch(/^\d+px$/);
  });
});
