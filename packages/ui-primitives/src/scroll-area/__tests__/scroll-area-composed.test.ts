import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

describe('ComposedScrollArea', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders root with data-part="scroll-area"', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ children: [] });
    expect(root.getAttribute('data-part')).toBe('scroll-area');
  });

  it('renders with position relative and overflow hidden', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ children: [] });
    expect(root.style.position).toBe('relative');
    expect(root.style.overflow).toBe('hidden');
  });

  it('distributes root class', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({
      classes: { root: 'my-root' },
      children: [],
    });
    expect(root.className).toContain('my-root');
  });

  it('renders viewport with overflow scroll', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ children: [] });
    container.appendChild(root);

    const viewport = root.querySelector('[data-part="scroll-area-viewport"]') as HTMLElement;
    expect(viewport).not.toBeNull();
    expect(viewport.style.overflow).toBe('scroll');
  });

  it('renders viewport with hidden native scrollbars', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ children: [] });
    container.appendChild(root);

    const viewport = root.querySelector('[data-part="scroll-area-viewport"]') as HTMLElement;
    // scrollbar-width may be set as a style attribute
    const styleAttr = viewport.getAttribute('style') || '';
    expect(styleAttr).toContain('scrollbar-width');
  });

  it('distributes viewport class', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({
      classes: { viewport: 'my-viewport' },
      children: [],
    });
    container.appendChild(root);

    const viewport = root.querySelector('[data-part="scroll-area-viewport"]') as HTMLElement;
    expect(viewport.className).toContain('my-viewport');
  });

  it('renders content container with data-part', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ children: ['Hello'] });
    container.appendChild(root);

    const content = root.querySelector('[data-part="scroll-area-content"]') as HTMLElement;
    expect(content).not.toBeNull();
  });

  it('defaults to vertical orientation with Y scrollbar only', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ children: [] });
    container.appendChild(root);

    const scrollbars = root.querySelectorAll('[data-part="scroll-area-scrollbar"]');
    expect(scrollbars.length).toBe(1);
    expect(scrollbars[0].getAttribute('data-orientation')).toBe('vertical');
  });

  it('horizontal orientation renders X scrollbar only', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ orientation: 'horizontal', children: [] });
    container.appendChild(root);

    const scrollbars = root.querySelectorAll('[data-part="scroll-area-scrollbar"]');
    expect(scrollbars.length).toBe(1);
    expect(scrollbars[0].getAttribute('data-orientation')).toBe('horizontal');
  });

  it('both orientation renders Y and X scrollbars', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ orientation: 'both', children: [] });
    container.appendChild(root);

    const scrollbars = root.querySelectorAll('[data-part="scroll-area-scrollbar"]');
    expect(scrollbars.length).toBe(2);

    const orientations = Array.from(scrollbars).map((s) => s.getAttribute('data-orientation'));
    expect(orientations).toContain('vertical');
    expect(orientations).toContain('horizontal');
  });

  it('scrollbars have aria-hidden="true"', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ orientation: 'both', children: [] });
    container.appendChild(root);

    const scrollbars = root.querySelectorAll('[data-part="scroll-area-scrollbar"]');
    for (const scrollbar of scrollbars) {
      expect(scrollbar.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('vertical scrollbar is absolutely positioned on the right edge', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ children: [] });
    container.appendChild(root);

    const scrollbar = root.querySelector(
      '[data-part="scroll-area-scrollbar"][data-orientation="vertical"]',
    ) as HTMLElement;
    expect(scrollbar.style.position).toBe('absolute');
    expect(scrollbar.style.top).toBe('0px');
    expect(scrollbar.style.right).toBe('0px');
    expect(scrollbar.style.bottom).toBe('0px');
  });

  it('horizontal scrollbar is absolutely positioned on the bottom edge', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ orientation: 'horizontal', children: [] });
    container.appendChild(root);

    const scrollbar = root.querySelector(
      '[data-part="scroll-area-scrollbar"][data-orientation="horizontal"]',
    ) as HTMLElement;
    expect(scrollbar.style.position).toBe('absolute');
    expect(scrollbar.style.bottom).toBe('0px');
    expect(scrollbar.style.left).toBe('0px');
    expect(scrollbar.style.right).toBe('0px');
  });

  it('distributes scrollbar class', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({
      classes: { scrollbar: 'my-scrollbar' },
      children: [],
    });
    container.appendChild(root);

    const scrollbar = root.querySelector('[data-part="scroll-area-scrollbar"]') as HTMLElement;
    expect(scrollbar.className).toContain('my-scrollbar');
  });

  it('distributes thumb class', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({
      classes: { thumb: 'my-thumb' },
      children: [],
    });
    container.appendChild(root);

    const thumb = root.querySelector('[data-part="scroll-area-thumb"]') as HTMLElement;
    expect(thumb.className).toContain('my-thumb');
  });

  it('renders thumb inside scrollbar', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ children: [] });
    container.appendChild(root);

    const scrollbar = root.querySelector('[data-part="scroll-area-scrollbar"]') as HTMLElement;
    const thumb = scrollbar.querySelector('[data-part="scroll-area-thumb"]') as HTMLElement;
    expect(thumb).not.toBeNull();
    expect(thumb.parentElement).toBe(scrollbar);
  });

  it('assembles correct DOM structure', async () => {
    const { ComposedScrollArea } = await import('../scroll-area-composed');
    const root = ComposedScrollArea({ orientation: 'both', children: [] });
    container.appendChild(root);

    const viewport = root.querySelector('[data-part="scroll-area-viewport"]') as HTMLElement;
    const content = root.querySelector('[data-part="scroll-area-content"]') as HTMLElement;

    // root > viewport > content
    expect(viewport.parentElement).toBe(root);
    expect(content.parentElement).toBe(viewport);

    // scrollbars are children of root
    const scrollbars = root.querySelectorAll('[data-part="scroll-area-scrollbar"]');
    for (const scrollbar of scrollbars) {
      expect(scrollbar.parentElement).toBe(root);
    }

    // thumbs are children of scrollbars
    const thumbs = root.querySelectorAll('[data-part="scroll-area-thumb"]');
    expect(thumbs.length).toBe(2);
  });
});
