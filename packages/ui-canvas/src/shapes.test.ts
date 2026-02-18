import { signal } from '@vertz/ui';
import { Graphics } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { Circle, Ellipse, Line, Rect } from './shapes';

describe('Feature: Circle shape', () => {
  describe('Given Circle with static props', () => {
    describe('When called', () => {
      it('then returns a Graphics instance via jsxCanvas', () => {
        const circle = Circle({ radius: 20, fill: 0xff0000 });
        expect(circle).toBeInstanceOf(Graphics);
      });
    });
  });

  describe('Given Circle with position props', () => {
    describe('When called', () => {
      it('then the display object has position set', () => {
        const circle = Circle({ x: 100, y: 200, radius: 20, fill: 0xff0000 });
        expect(circle.x).toBe(100);
        expect(circle.y).toBe(200);
      });
    });
  });

  describe('Given Circle with reactive radius', () => {
    describe('When the signal changes', () => {
      it('then the draw function re-runs (circle is redrawn)', () => {
        const radius = signal(10);
        const circle = Circle({ radius: () => radius.value, fill: 0xff0000 });

        const clearSpy = vi.spyOn(circle as Graphics, 'clear');

        radius.value = 20;
        expect(clearSpy).toHaveBeenCalled();

        clearSpy.mockRestore();
      });
    });
  });
});

describe('Feature: Rect shape', () => {
  describe('Given Rect with static props', () => {
    describe('When called', () => {
      it('then returns a Graphics instance', () => {
        const rect = Rect({ width: 100, height: 50, fill: 0x00ff00 });
        expect(rect).toBeInstanceOf(Graphics);
      });
    });
  });

  describe('Given Rect with position', () => {
    describe('When called', () => {
      it('then has position set', () => {
        const rect = Rect({ x: 10, y: 20, width: 100, height: 50, fill: 0x00ff00 });
        expect(rect.x).toBe(10);
        expect(rect.y).toBe(20);
      });
    });
  });
});

describe('Feature: Line shape', () => {
  describe('Given Line with from/to points', () => {
    describe('When called', () => {
      it('then returns a Graphics instance', () => {
        const line = Line({
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          stroke: 0xffffff,
        });
        expect(line).toBeInstanceOf(Graphics);
      });
    });
  });
});

describe('Feature: Ellipse shape', () => {
  describe('Given Ellipse with radii', () => {
    describe('When called', () => {
      it('then returns a Graphics instance', () => {
        const ellipse = Ellipse({ radiusX: 50, radiusY: 30, fill: 0x0000ff });
        expect(ellipse).toBeInstanceOf(Graphics);
      });
    });
  });

  describe('Given Ellipse with position', () => {
    describe('When called', () => {
      it('then has position set', () => {
        const ellipse = Ellipse({ x: 50, y: 75, radiusX: 50, radiusY: 30, fill: 0x0000ff });
        expect(ellipse.x).toBe(50);
        expect(ellipse.y).toBe(75);
      });
    });
  });
});
