import { describe, expect, test, vi } from 'bun:test';
import { signal } from '../../runtime/signal';
import { createLink } from '../link';

describe('Link component', () => {
  test('creates an anchor element with href', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'Home', href: '/' });

    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('/');
    expect(el.textContent).toBe('Home');
  });

  test('clicking link calls navigate and prevents default', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'About', href: '/about' });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    el.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/about');
  });

  test('applies activeClass when href matches current path', () => {
    const currentPath = signal('/about');
    const navigate = vi.fn();
    const Link = createLink(currentPath, navigate);

    const el = Link({ activeClass: 'active', children: 'About', href: '/about' });

    expect(el.classList.contains('active')).toBe(true);
  });

  test('does not apply activeClass when href does not match', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const Link = createLink(currentPath, navigate);

    const el = Link({ activeClass: 'active', children: 'About', href: '/about' });

    expect(el.classList.contains('active')).toBe(false);
  });

  test('applies className to the anchor', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'Home', className: 'nav-link', href: '/' });

    expect(el.classList.contains('nav-link')).toBe(true);
  });

  test('does not navigate on ctrl+click (allows new tab)', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'About', href: '/about' });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    el.dispatchEvent(event);

    expect(navigate).not.toHaveBeenCalled();
  });

  test('does not navigate on meta+click (allows new tab on Mac)', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'About', href: '/about' });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    el.dispatchEvent(event);

    expect(navigate).not.toHaveBeenCalled();
  });

  test('activeClass toggles reactively when currentPath changes', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const Link = createLink(currentPath, navigate);

    const el = Link({ activeClass: 'active', children: 'About', href: '/about' });

    // Initially not active
    expect(el.classList.contains('active')).toBe(false);

    // Navigate to /about
    currentPath.value = '/about';

    // Now should be active
    expect(el.classList.contains('active')).toBe(true);

    // Navigate away
    currentPath.value = '/other';

    // Should no longer be active
    expect(el.classList.contains('active')).toBe(false);
  });
});

// ─── Hover Prefetch ──────────────────────────────────────────

describe('Link hover prefetch', () => {
  test('createLink accepts onPrefetch callback option', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const onPrefetch = vi.fn();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about' });
    expect(el.tagName).toBe('A');
  });

  test('mouseenter fires onPrefetch when prefetch: hover', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const onPrefetch = vi.fn();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about', prefetch: 'hover' });
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(onPrefetch).toHaveBeenCalledWith('/about');
  });

  test('focus fires onPrefetch when prefetch: hover', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const onPrefetch = vi.fn();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about', prefetch: 'hover' });
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    expect(onPrefetch).toHaveBeenCalledWith('/about');
  });

  test('no prefetch without prefetch prop', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const onPrefetch = vi.fn();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about' });
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    expect(onPrefetch).not.toHaveBeenCalled();
  });

  test('only fires once per link (dedup)', () => {
    const currentPath = signal('/');
    const navigate = vi.fn();
    const onPrefetch = vi.fn();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about', prefetch: 'hover' });
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    expect(onPrefetch).toHaveBeenCalledTimes(1);
  });
});
