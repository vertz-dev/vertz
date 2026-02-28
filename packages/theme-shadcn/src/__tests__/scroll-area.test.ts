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
  it('applies style classes to elements', async () => {
    const { createThemedScrollArea } = await import('../components/primitives/scroll-area');
    const styles = createScrollAreaStyles();
    const themedScrollArea = createThemedScrollArea(styles);
    const result = themedScrollArea({ orientation: 'both' });

    expect(result.root.classList.contains(styles.root)).toBe(true);
    expect(result.viewport.classList.contains(styles.viewport)).toBe(true);
    expect(result.scrollbarY.classList.contains(styles.scrollbar)).toBe(true);
    expect(result.thumbY.classList.contains(styles.thumb)).toBe(true);
    expect(result.scrollbarX.classList.contains(styles.scrollbar)).toBe(true);
    expect(result.thumbX.classList.contains(styles.thumb)).toBe(true);
  });

  it('passes options through to primitive', async () => {
    const { createThemedScrollArea } = await import('../components/primitives/scroll-area');
    const styles = createScrollAreaStyles();
    const themedScrollArea = createThemedScrollArea(styles);
    const result = themedScrollArea({ orientation: 'horizontal' });

    expect(result.scrollbarX.parentElement).toBe(result.root);
    expect(result.scrollbarY.parentElement).toBeNull();
  });

  it('returns all expected elements and state', async () => {
    const { createThemedScrollArea } = await import('../components/primitives/scroll-area');
    const styles = createScrollAreaStyles();
    const themedScrollArea = createThemedScrollArea(styles);
    const result = themedScrollArea();

    expect(result.root).toBeInstanceOf(HTMLDivElement);
    expect(result.viewport).toBeInstanceOf(HTMLDivElement);
    expect(result.content).toBeInstanceOf(HTMLDivElement);
    expect(result.state.scrollTop).toBeDefined();
    expect(result.state.scrollLeft).toBeDefined();
    expect(typeof result.update).toBe('function');
  });
});
