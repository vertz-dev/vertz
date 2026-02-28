import { describe, expect, it } from 'bun:test';
import { createSkeletonComponents } from '../components/skeleton';
import { createSkeletonStyles } from '../styles/skeleton';

describe('skeleton styles', () => {
  const skeleton = createSkeletonStyles();

  it('has base block', () => {
    expect(typeof skeleton.base).toBe('string');
    expect(skeleton.base.length).toBeGreaterThan(0);
  });

  it('CSS contains pulse animation', () => {
    expect(skeleton.css).toContain('vz-skeleton-pulse');
  });
});

describe('Skeleton components', () => {
  const styles = createSkeletonStyles();
  const { Skeleton } = createSkeletonComponents(styles);

  it('returns an HTMLDivElement with base class', () => {
    const el = Skeleton();
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(styles.base);
  });

  it('sets aria-hidden="true"', () => {
    const el = Skeleton();
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies width and height via style', () => {
    const el = Skeleton({ width: '200px', height: '20px' });
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('20px');
  });

  it('does not set style when width/height omitted', () => {
    const el = Skeleton();
    expect(el.style.width).toBe('');
    expect(el.style.height).toBe('');
  });

  it('appends user class', () => {
    const el = Skeleton({ class: 'custom-skeleton' });
    expect(el.className).toContain('custom-skeleton');
    expect(el.className).toContain(styles.base);
  });
});
