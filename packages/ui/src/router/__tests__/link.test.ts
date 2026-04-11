import { describe, expect, test, mock, spyOn } from '@vertz/test';
import { signal } from '../../runtime/signal';
import { defineRoutes } from '../define-routes';
import { createLink, Link } from '../link';
import { createRouter } from '../navigate';
import { RouterContext } from '../router-context';

describe('Link component', () => {
  test('creates an anchor element with href', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'Home', href: '/' });

    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('/');
    expect(el.textContent).toBe('Home');
  });

  test('clicking link calls navigate and prevents default', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'About', href: '/about' });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventSpy = spyOn(event, 'preventDefault');
    el.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/about');
  });

  test('applies activeClass when href matches current path', () => {
    const currentPath = signal('/about');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ activeClass: 'active', children: 'About', href: '/about' });

    expect(el.classList.contains('active')).toBe(true);
  });

  test('does not apply activeClass when href does not match', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ activeClass: 'active', children: 'About', href: '/about' });

    expect(el.classList.contains('active')).toBe(false);
  });

  test('applies className to the anchor', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'Home', className: 'nav-link', href: '/' });

    expect(el.classList.contains('nav-link')).toBe(true);
  });

  test('applies class prop to the anchor', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'Home', class: 'nav-link', href: '/' });

    expect(el.classList.contains('nav-link')).toBe(true);
  });

  test('className prop takes precedence over class', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'Home', className: 'primary', class: 'secondary', href: '/' });

    expect(el.classList.contains('primary')).toBe(true);
    expect(el.classList.contains('secondary')).toBe(false);
  });

  test('does not navigate on ctrl+click (allows new tab)', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'About', href: '/about' });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    el.dispatchEvent(event);

    expect(navigate).not.toHaveBeenCalled();
  });

  test('does not navigate on meta+click (allows new tab on Mac)', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: 'About', href: '/about' });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    el.dispatchEvent(event);

    expect(navigate).not.toHaveBeenCalled();
  });

  test('accepts thunked string children', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const el = Link({ children: () => 'Home', href: '/' });

    expect(el.tagName).toBe('A');
    expect(el.textContent).toBe('Home');
  });

  test('renders multiple Node children (icon + text pattern)', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const icon = document.createElement('span');
    icon.textContent = '🏠';
    const text = document.createElement('span');
    text.textContent = 'Home';

    const el = Link({ children: () => [icon, text], href: '/' });

    expect(el.tagName).toBe('A');
    expect(el.querySelectorAll('span').length).toBe(2);
    expect(el.textContent).toBe('🏠Home');
  });

  test('renders array of mixed string and Node children', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const bold = document.createElement('strong');
    bold.textContent = 'Store';

    const el = Link({ children: () => [bold, 'front'], href: '/' });

    expect(el.textContent).toBe('Storefront');
    expect(el.querySelector('strong')).toBeTruthy();
  });

  test('activeClass toggles reactively when currentPath changes', () => {
    const currentPath = signal('/');
    const navigate = mock();
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

// ─── XSS Prevention ──────────────────────────────────────────

describe('Link XSS prevention', () => {
  test('blocks javascript: href', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety against untyped input
    const el = Link({ children: 'XSS', href: 'javascript:alert(1)' as any });

    expect(el.getAttribute('href')).toBe('#');
  });

  test('blocks JAVASCRIPT: href (case insensitive)', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety against untyped input
    const el = Link({ children: 'XSS', href: 'JAVASCRIPT:alert(1)' as any });

    expect(el.getAttribute('href')).toBe('#');
  });

  test('blocks data: href', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety against untyped input
    const el = Link({
      children: 'XSS',
      href: 'data:text/html,<script>alert(1)</script>' as any,
    });

    expect(el.getAttribute('href')).toBe('#');
  });

  test('blocks vbscript: href', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety against untyped input
    const el = Link({ children: 'XSS', href: 'vbscript:msgbox' as any });

    expect(el.getAttribute('href')).toBe('#');
  });

  test('blocks protocol-relative URLs', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety against untyped input
    const el = Link({ children: 'XSS', href: '//evil.com/phishing' as any });

    expect(el.getAttribute('href')).toBe('#');
  });

  test('blocks javascript: with whitespace injection', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety against untyped input
    const el = Link({ children: 'XSS', href: ' javascript:alert(1)' as any });

    expect(el.getAttribute('href')).toBe('#');
  });

  test('does not navigate to blocked URLs on click', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety against untyped input
    const el = Link({ children: 'XSS', href: 'javascript:alert(1)' as any });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);

    expect(navigate).toHaveBeenCalledWith('#');
  });

  test('allows safe URLs', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const Link = createLink(currentPath, navigate);

    const safeHrefs = ['/about', '#section', 'https://example.com', 'http://example.com'];

    for (const href of safeHrefs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety with external URLs
      const el = Link({ children: 'Link', href: href as any });
      expect(el.getAttribute('href')).toBe(href);
    }
  });
});

// ─── Hover Prefetch ──────────────────────────────────────────

describe('Link hover prefetch', () => {
  test('createLink accepts onPrefetch callback option', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const onPrefetch = mock();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about' });
    expect(el.tagName).toBe('A');
  });

  test('mouseenter fires onPrefetch when prefetch: hover', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const onPrefetch = mock();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about', prefetch: 'hover' });
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(onPrefetch).toHaveBeenCalledWith('/about');
  });

  test('focus fires onPrefetch when prefetch: hover', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const onPrefetch = mock();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about', prefetch: 'hover' });
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    expect(onPrefetch).toHaveBeenCalledWith('/about');
  });

  test('no prefetch without prefetch prop', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const onPrefetch = mock();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about' });
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    expect(onPrefetch).not.toHaveBeenCalled();
  });

  test('only fires once per link (dedup)', () => {
    const currentPath = signal('/');
    const navigate = mock();
    const onPrefetch = mock();
    const Link = createLink(currentPath, navigate, { onPrefetch });

    const el = Link({ children: 'About', href: '/about', prefetch: 'hover' });
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    expect(onPrefetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Context-based Link ─────────────────────────────────────

describe('Link (context-based)', () => {
  function renderInRouter<T>(path: string, fn: () => T): T {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
      '/manifesto': { component: () => document.createElement('div') },
    });
    const router = createRouter(routes, path);
    let result: T;
    RouterContext.Provider(router, () => {
      result = fn();
    });
    router.dispose();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- result is assigned synchronously in Provider callback
    return result!;
  }

  test('throws when used outside RouterContext.Provider', () => {
    expect(() => Link({ children: 'Home', href: '/' })).toThrow();
  });

  test('creates an anchor element with href', () => {
    const el = renderInRouter('/', () => Link({ children: 'Home', href: '/' }));
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('/');
    expect(el.textContent).toBe('Home');
  });

  test('clicking link navigates without full page reload', () => {
    const el = renderInRouter('/', () => Link({ children: 'About', href: '/about' }));

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventSpy = spyOn(event, 'preventDefault');
    el.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalled();
  });

  test('modifier-key clicks are not intercepted', () => {
    const el = renderInRouter('/', () => Link({ children: 'About', href: '/about' }));

    const ctrlClick = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    const preventSpy = spyOn(ctrlClick, 'preventDefault');
    el.dispatchEvent(ctrlClick);
    expect(preventSpy).not.toHaveBeenCalled();

    const metaClick = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    const preventSpy2 = spyOn(metaClick, 'preventDefault');
    el.dispatchEvent(metaClick);
    expect(preventSpy2).not.toHaveBeenCalled();
  });

  test('applies className to the anchor', () => {
    const el = renderInRouter('/', () =>
      Link({ children: 'Home', className: 'nav-link', href: '/' }),
    );
    expect(el.classList.contains('nav-link')).toBe(true);
  });

  test('applies class prop to the anchor', () => {
    const el = renderInRouter('/', () => Link({ children: 'Home', class: 'nav-link', href: '/' }));
    expect(el.classList.contains('nav-link')).toBe(true);
  });

  test('className prop takes precedence over class', () => {
    const el = renderInRouter('/', () =>
      Link({ children: 'Home', className: 'primary', class: 'secondary', href: '/' }),
    );
    expect(el.classList.contains('primary')).toBe(true);
    expect(el.classList.contains('secondary')).toBe(false);
  });

  test('accepts thunked children', () => {
    const el = renderInRouter('/', () => Link({ children: () => 'About', href: '/about' }));
    expect(el.textContent).toBe('About');
  });

  test('renders multiple Node children', () => {
    const icon = document.createElement('span');
    icon.textContent = '📖';
    const text = document.createElement('span');
    text.textContent = 'About';

    const el = renderInRouter('/', () => Link({ children: () => [icon, text], href: '/about' }));

    expect(el.querySelectorAll('span').length).toBe(2);
    expect(el.textContent).toBe('📖About');
  });

  test('blocks dangerous href schemes', () => {
    const el = renderInRouter('/', () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime safety against untyped input
      Link({ children: 'XSS', href: 'javascript:alert(1)' as any }),
    );
    expect(el.getAttribute('href')).toBe('#');
  });
});
