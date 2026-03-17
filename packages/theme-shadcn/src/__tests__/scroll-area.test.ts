import { describe, expect, it } from 'bun:test';
import { createScrollAreaStyles } from '../styles/scroll-area';

describe('scroll-area styles', () => {
  const scrollArea = createScrollAreaStyles();

  it('has root block', () => {
    expect(typeof scrollArea.root).toBe('string');
  });

  it('has viewport block', () => {
    expect(typeof scrollArea.viewport).toBe('string');
  });

  it('has scrollbar block', () => {
    expect(typeof scrollArea.scrollbar).toBe('string');
  });

  it('has thumb block', () => {
    expect(typeof scrollArea.thumb).toBe('string');
  });

  it('class names are non-empty', () => {
    expect(scrollArea.root.length).toBeGreaterThan(0);
    expect(scrollArea.viewport.length).toBeGreaterThan(0);
    expect(scrollArea.scrollbar.length).toBeGreaterThan(0);
    expect(scrollArea.thumb.length).toBeGreaterThan(0);
  });

  it('CSS contains data-orientation selectors', () => {
    expect(scrollArea.css).toContain('[data-orientation="vertical"]');
    expect(scrollArea.css).toContain('[data-orientation="horizontal"]');
  });
});

describe('themed ScrollArea', () => {
  const styles = createScrollAreaStyles();

  it('applies style classes to scroll-area elements', async () => {
    const { createThemedScrollArea } = await import('../components/primitives/scroll-area');
    const ScrollArea = createThemedScrollArea(styles);
    const root = ScrollArea({ orientation: 'both' });

    expect(root.className).toContain(styles.root);

    const viewport = root.querySelector('[data-part="scroll-area-viewport"]') as HTMLElement;
    expect(viewport.className).toContain(styles.viewport);

    const scrollbars = root.querySelectorAll('[data-part="scroll-area-scrollbar"]');
    for (const scrollbar of scrollbars) {
      expect((scrollbar as HTMLElement).className).toContain(styles.scrollbar);
    }

    const thumbs = root.querySelectorAll('[data-part="scroll-area-thumb"]');
    for (const thumb of thumbs) {
      expect((thumb as HTMLElement).className).toContain(styles.thumb);
    }
  });

  it('passes orientation through to primitive', async () => {
    const { createThemedScrollArea } = await import('../components/primitives/scroll-area');
    const ScrollArea = createThemedScrollArea(styles);
    const root = ScrollArea({ orientation: 'horizontal' });

    const scrollbars = root.querySelectorAll('[data-part="scroll-area-scrollbar"]');
    expect(scrollbars.length).toBe(1);
    expect(scrollbars[0].getAttribute('data-orientation')).toBe('horizontal');
  });

  it('renders root with viewport and content', async () => {
    const { createThemedScrollArea } = await import('../components/primitives/scroll-area');
    const ScrollArea = createThemedScrollArea(styles);
    const root = ScrollArea({});

    expect(root).toBeInstanceOf(HTMLDivElement);

    const viewport = root.querySelector('[data-part="scroll-area-viewport"]') as HTMLElement;
    expect(viewport).toBeInstanceOf(HTMLDivElement);

    const content = root.querySelector('[data-part="scroll-area-content"]') as HTMLElement;
    expect(content).toBeInstanceOf(HTMLDivElement);
  });

  it('renders scrollbar with thumb inside', async () => {
    const { createThemedScrollArea } = await import('../components/primitives/scroll-area');
    const ScrollArea = createThemedScrollArea(styles);
    const root = ScrollArea({});

    const scrollbar = root.querySelector('[data-part="scroll-area-scrollbar"]') as HTMLElement;
    expect(scrollbar).not.toBeNull();
    expect(scrollbar.getAttribute('aria-hidden')).toBe('true');

    const thumb = scrollbar.querySelector('[data-part="scroll-area-thumb"]') as HTMLElement;
    expect(thumb).not.toBeNull();
  });

  it('defaults to vertical orientation', async () => {
    const { createThemedScrollArea } = await import('../components/primitives/scroll-area');
    const ScrollArea = createThemedScrollArea(styles);
    const root = ScrollArea({});

    const scrollbars = root.querySelectorAll('[data-part="scroll-area-scrollbar"]');
    expect(scrollbars.length).toBe(1);
    expect(scrollbars[0].getAttribute('data-orientation')).toBe('vertical');
  });
});
