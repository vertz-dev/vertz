import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { NavigationMenu } from '../navigation-menu';

describe('NavigationMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.removeChild(container);
  });

  it('root is a <nav> element', () => {
    const { root } = NavigationMenu.Root();
    expect(root.tagName).toBe('NAV');
  });

  it('triggers have aria-expanded="false" by default', () => {
    const { root, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger } = Item('products', 'Products');

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('content is hidden by default', () => {
    const { root, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { content } = Item('products', 'Products');

    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.style.display).toBe('none');
  });

  it('click opens content and sets aria-expanded="true"', () => {
    const { root, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger, content } = Item('products', 'Products');

    trigger.click();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('click again closes content', () => {
    const { root, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger } = Item('products', 'Products');

    trigger.click();
    trigger.click();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('data-state')).toBe('closed');
  });

  it('ArrowRight navigates between triggers', () => {
    const { root, list, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger: t1 } = Item('products', 'Products');
    const { trigger: t2 } = Item('resources', 'Resources');

    t1.focus();

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(t2);
  });

  it('ArrowLeft navigates between triggers', () => {
    const { root, list, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger: t1 } = Item('products', 'Products');
    const { trigger: t2 } = Item('resources', 'Resources');

    t2.focus();

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(t1);
  });

  it('Enter opens panel and focuses first focusable inside', () => {
    const { root, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger, content } = Item('products', 'Products');
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'First link';
    content.appendChild(link);

    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // focusFirst is called via queueMicrotask
    vi.runAllTimers();
    // queueMicrotask needs a tick
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(document.activeElement).toBe(link);
        resolve();
      });
    });
  });

  it('Escape closes panel', () => {
    const { root, state, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger } = Item('products', 'Products');

    trigger.click();
    expect(state.activeItem.peek()).toBe('products');

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.activeItem.peek()).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('only one panel open at a time', () => {
    const { root, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger: t1, content: c1 } = Item('products', 'Products');
    const { trigger: t2, content: c2 } = Item('resources', 'Resources');

    t1.click();
    expect(t1.getAttribute('aria-expanded')).toBe('true');
    expect(c1.getAttribute('data-state')).toBe('open');

    t2.click();
    expect(t1.getAttribute('aria-expanded')).toBe('false');
    expect(t1.getAttribute('data-state')).toBe('closed');
    expect(t2.getAttribute('aria-expanded')).toBe('true');
    expect(c2.getAttribute('data-state')).toBe('open');
  });

  it('hover with delay opens content', () => {
    const { root, Item } = NavigationMenu.Root({ delayOpen: 200 });
    container.appendChild(root);
    const { trigger, content } = Item('products', 'Products');

    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    // Before delay
    expect(content.getAttribute('aria-hidden')).toBe('true');

    // After delay
    vi.advanceTimersByTime(200);
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('hover from trigger to content cancels close (grace period)', () => {
    const { root, Item } = NavigationMenu.Root({ delayOpen: 200, delayClose: 300 });
    container.appendChild(root);
    const { trigger, content } = Item('products', 'Products');

    // Open via hover
    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(content.getAttribute('aria-hidden')).toBe('false');

    // Leave trigger — starts close timer
    trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

    // Enter content — cancels close
    content.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    // Wait past close delay — should still be open
    vi.advanceTimersByTime(300);
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('Link creates an <a> element with href', () => {
    const { root, Link } = NavigationMenu.Root();
    container.appendChild(root);
    const link = Link('/about', 'About');

    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/about');
    expect(link.textContent).toBe('About');
  });

  it('Escape from content closes panel and returns focus to trigger', () => {
    const { root, Item } = NavigationMenu.Root();
    container.appendChild(root);
    const { trigger, content } = Item('products', 'Products');
    const link = document.createElement('a');
    link.href = '#';
    content.appendChild(link);

    trigger.click();
    link.focus();

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
