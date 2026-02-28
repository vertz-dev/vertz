import { describe, expect, it } from 'bun:test';
import { ScrollArea } from '../scroll-area';

describe('ScrollArea', () => {
  it('creates a root element', () => {
    const { root } = ScrollArea.Root();
    expect(root).toBeInstanceOf(HTMLDivElement);
    expect(root.style.position).toBe('relative');
    expect(root.style.overflow).toBe('hidden');
  });

  it('viewport has overflow:scroll and hidden native scrollbars', () => {
    const { viewport } = ScrollArea.Root();
    expect(viewport.style.overflow).toBe('scroll');
    expect(viewport.style.scrollbarWidth).toBe('none');
  });

  it('scrollbars have aria-hidden="true"', () => {
    const { scrollbarY, scrollbarX } = ScrollArea.Root({ orientation: 'both' });
    expect(scrollbarY.getAttribute('aria-hidden')).toBe('true');
    expect(scrollbarX.getAttribute('aria-hidden')).toBe('true');
  });

  it('scrollbars have data-orientation attributes', () => {
    const { scrollbarY, scrollbarX } = ScrollArea.Root({ orientation: 'both' });
    expect(scrollbarY.getAttribute('data-orientation')).toBe('vertical');
    expect(scrollbarX.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('assembles correct DOM structure', () => {
    const { root, viewport, content, scrollbarY, thumbY, scrollbarX, thumbX } = ScrollArea.Root({
      orientation: 'both',
    });
    // root > viewport > content
    expect(viewport.parentElement).toBe(root);
    expect(content.parentElement).toBe(viewport);
    // root > scrollbarY > thumbY
    expect(scrollbarY.parentElement).toBe(root);
    expect(thumbY.parentElement).toBe(scrollbarY);
    // root > scrollbarX > thumbX
    expect(scrollbarX.parentElement).toBe(root);
    expect(thumbX.parentElement).toBe(scrollbarX);
  });

  it('exposes update as a function', () => {
    const { update } = ScrollArea.Root();
    expect(typeof update).toBe('function');
  });

  it('vertical orientation only appends Y scrollbar', () => {
    const { root, scrollbarY, scrollbarX } = ScrollArea.Root({ orientation: 'vertical' });
    expect(scrollbarY.parentElement).toBe(root);
    expect(scrollbarX.parentElement).toBeNull();
  });

  it('horizontal orientation only appends X scrollbar', () => {
    const { root, scrollbarY, scrollbarX } = ScrollArea.Root({ orientation: 'horizontal' });
    expect(scrollbarY.parentElement).toBeNull();
    expect(scrollbarX.parentElement).toBe(root);
  });

  it('both orientation appends both scrollbars', () => {
    const { root, scrollbarY, scrollbarX } = ScrollArea.Root({ orientation: 'both' });
    expect(scrollbarY.parentElement).toBe(root);
    expect(scrollbarX.parentElement).toBe(root);
  });

  it('defaults to vertical orientation', () => {
    const { root, scrollbarY, scrollbarX } = ScrollArea.Root();
    expect(scrollbarY.parentElement).toBe(root);
    expect(scrollbarX.parentElement).toBeNull();
  });
});
