import { describe, expect, it } from '@vertz/test';
import { computeProgress } from '../reading-progress';

describe('Feature: Reading progress math', () => {
  describe('Given the body top is still below the viewport', () => {
    describe('When computeProgress runs', () => {
      it('then progress is 0', () => {
        // Body rect: top = +800 (hasn't entered viewport yet)
        expect(computeProgress({ bodyTop: 800, bodyHeight: 2000, viewportHeight: 900 })).toBe(0);
      });
    });
  });

  describe('Given the body is fully visible and scrolled halfway', () => {
    describe('When computeProgress runs', () => {
      it('then progress equals half of readable range', () => {
        // Half-read: body starts 1000px above viewport, body is 2000px tall, 900px viewport
        // readable = 2000 - 900 = 1100; scrolled = -bodyTop = 1000 → 1000/1100 ≈ 0.909
        const p = computeProgress({ bodyTop: -1000, bodyHeight: 2000, viewportHeight: 900 });
        expect(p).toBeGreaterThan(0.9);
        expect(p).toBeLessThan(0.92);
      });
    });
  });

  describe('Given the body is fully scrolled past', () => {
    describe('When computeProgress runs', () => {
      it('then progress clamps to 1', () => {
        expect(computeProgress({ bodyTop: -5000, bodyHeight: 2000, viewportHeight: 900 })).toBe(1);
      });
    });
  });

  describe('Given body height is shorter than viewport', () => {
    describe('When computeProgress runs', () => {
      it('then progress returns 1 (nothing to scroll)', () => {
        expect(computeProgress({ bodyTop: 0, bodyHeight: 500, viewportHeight: 900 })).toBe(1);
      });
    });
  });

  describe('Given the body top is exactly at the top of the viewport', () => {
    describe('When computeProgress runs', () => {
      it('then progress is 0 (not scrolled yet)', () => {
        expect(computeProgress({ bodyTop: 0, bodyHeight: 2000, viewportHeight: 900 })).toBe(0);
      });
    });
  });
});
