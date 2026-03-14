import { describe, expect, it } from 'bun:test';
import { hitTest } from '../input/hit-test';
import { type ComputedLayout, computeLayout } from '../layout/layout';
import { NativeElement } from '../native-element';

describe('hitTest', () => {
  function buildTree() {
    const root = new NativeElement('div');
    root.setAttribute('style:width', '800');
    root.setAttribute('style:height', '600');

    const child1 = new NativeElement('div');
    child1.setAttribute('style:height', '100');
    root.appendChild(child1);

    const child2 = new NativeElement('div');
    child2.setAttribute('style:height', '100');
    root.appendChild(child2);

    const layouts = computeLayout(root, 800, 600);
    return { root, child1, child2, layouts };
  }

  describe('Given a point inside a child element', () => {
    it('Then returns that child element', () => {
      const { child1, layouts } = buildTree();
      const result = hitTest(50, 50, layouts);
      expect(result).toBe(child1);
    });
  });

  describe('Given a point inside the second child', () => {
    it('Then returns the second child', () => {
      const { child2, layouts } = buildTree();
      const result = hitTest(50, 150, layouts);
      expect(result).toBe(child2);
    });
  });

  describe('Given a point outside all children but inside root', () => {
    it('Then returns the root element', () => {
      const { root, layouts } = buildTree();
      const result = hitTest(50, 500, layouts);
      expect(result).toBe(root);
    });
  });

  describe('Given nested elements', () => {
    it('Then returns the deepest element at the point', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:width', '800');
      root.setAttribute('style:height', '600');

      const outer = new NativeElement('div');
      outer.setAttribute('style:height', '200');
      root.appendChild(outer);

      const inner = new NativeElement('div');
      inner.setAttribute('style:height', '50');
      outer.appendChild(inner);

      const layouts = computeLayout(root, 800, 600);
      const result = hitTest(50, 25, layouts);
      expect(result).toBe(inner);
    });
  });

  describe('Given a point outside all elements', () => {
    it('Then returns null', () => {
      const layouts = new Map<NativeElement, ComputedLayout>();
      const result = hitTest(50, 50, layouts);
      expect(result).toBeNull();
    });
  });

  describe('Given overlapping elements at same depth', () => {
    it('Then returns the last one (front-most in draw order)', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:width', '800');
      root.setAttribute('style:height', '600');

      // Two children that overlap (both at y=0, height 100)
      const a = new NativeElement('div');
      a.setAttribute('style:height', '100');
      root.appendChild(a);

      const b = new NativeElement('div');
      b.setAttribute('style:height', '100');
      root.appendChild(b);

      // b starts at y=100, so at y=50 only a is hit
      const layouts = computeLayout(root, 800, 600);
      const result = hitTest(50, 50, layouts);
      expect(result).toBe(a);
    });
  });

  describe('Given an element with display:none', () => {
    it('Then it is not hit', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:width', '800');
      root.setAttribute('style:height', '600');

      const visible = new NativeElement('div');
      visible.setAttribute('style:height', '100');
      root.appendChild(visible);

      const hidden = new NativeElement('div');
      hidden.setAttribute('style:display', 'none');
      hidden.setAttribute('style:height', '100');
      root.appendChild(hidden);

      const layouts = computeLayout(root, 800, 600);
      // Point at y=150 would be in hidden element's area, but it's display:none
      // Yoga gives display:none elements zero size, so they won't appear in layout
      const result = hitTest(50, 50, layouts);
      expect(result).toBe(visible);
    });
  });
});
