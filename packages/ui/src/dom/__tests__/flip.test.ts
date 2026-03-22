import { describe, expect, it } from 'bun:test';
import { flipAnimate, snapshotRects } from '../flip';

describe('flip utilities', () => {
  describe('snapshotRects', () => {
    it('captures bounding rect for each keyed element', () => {
      const nodeMap = new Map<string | number, Node>();

      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      nodeMap.set('a', el1);
      nodeMap.set('b', el2);

      // Mock getBoundingClientRect
      el1.getBoundingClientRect = () => ({ top: 10, left: 0, width: 100, height: 40 }) as DOMRect;
      el2.getBoundingClientRect = () => ({ top: 50, left: 0, width: 100, height: 40 }) as DOMRect;

      const rects = snapshotRects(nodeMap);

      expect(rects.get('a')?.top).toBe(10);
      expect(rects.get('b')?.top).toBe(50);
    });

    it('skips non-Element nodes', () => {
      const nodeMap = new Map<string | number, Node>();
      const text = document.createTextNode('hello');
      nodeMap.set('t', text);

      const rects = snapshotRects(nodeMap);
      expect(rects.size).toBe(0);
    });
  });

  describe('flipAnimate', () => {
    it('applies inverse transform then clears it on next frame', async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      const firstRect = { top: 100, left: 0, width: 100, height: 40 } as DOMRect;
      el.getBoundingClientRect = () => ({ top: 200, left: 0, width: 100, height: 40 }) as DOMRect;

      flipAnimate(el, firstRect, 200, 'ease-out');

      // Invert phase: element has transform set immediately
      expect(el.style.transform).toBe('translate(0px, -100px)');

      // Play phase: after rAF, transition is set and transform cleared
      await new Promise((r) => requestAnimationFrame(r));

      expect(el.style.transition).toBe('transform 200ms ease-out');
      expect(el.style.transform).toBe('');

      document.body.removeChild(el);
    });

    it('skips animation when movement is negligible', () => {
      const el = document.createElement('div');

      const firstRect = { top: 100, left: 50, width: 100, height: 40 } as DOMRect;
      el.getBoundingClientRect = () =>
        ({ top: 100.2, left: 50.1, width: 100, height: 40 }) as DOMRect;

      flipAnimate(el, firstRect, 200, 'ease-out');

      // No transform applied — delta too small
      expect(el.style.transform).toBe('');
    });

    it('cleans up transition on transitionend', async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      const firstRect = { top: 0, left: 0, width: 100, height: 40 } as DOMRect;
      el.getBoundingClientRect = () => ({ top: 50, left: 0, width: 100, height: 40 }) as DOMRect;

      flipAnimate(el, firstRect, 200, 'ease-out');

      await new Promise((r) => requestAnimationFrame(r));
      expect(el.style.transition).toBe('transform 200ms ease-out');

      // Simulate transitionend
      el.dispatchEvent(new Event('transitionend'));
      expect(el.style.transition).toBe('');

      document.body.removeChild(el);
    });
  });
});
