import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

describe('Graphics Redraw Performance POC', () => {
  describe('Given a Graphics with 100+ paths', () => {
    it('then clear() + redraw completes in under 5ms', () => {
      const g = new Graphics();

      function drawComplexShape(g: Graphics, offset: number) {
        for (let i = 0; i < 100; i++) {
          g.rect(i * 10 + offset, i * 5, 50, 30);
          g.fill(0xff0000 + i * 100);
          g.circle(i * 15, i * 10 + offset, 20);
          g.fill(0x00ff00 + i * 200);
        }
      }

      // Warm up
      drawComplexShape(g, 0);

      // Benchmark: measure clear + redraw time
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        g.clear();
        drawComplexShape(g, i);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / iterations;

      console.log(`Graphics redraw (100 paths): avg ${avgMs.toFixed(3)}ms per frame`);
      console.log(`Theoretical max FPS: ${(1000 / avgMs).toFixed(0)}`);

      // At 60fps, each frame has ~16.67ms budget.
      // Graphics redraw should take < 5ms to leave room for other work.
      // Threshold is generous to avoid flaky failures on slower CI runners.
      expect(avgMs).toBeLessThan(5);

      g.destroy();
    });

    it('then clear() + redraw with 500 paths completes in under 10ms', () => {
      const g = new Graphics();

      function drawManyPaths(g: Graphics, offset: number) {
        for (let i = 0; i < 500; i++) {
          g.rect(i * 2 + offset, i, 10, 10);
          g.fill(0xff0000 + (i % 256) * 100);
        }
      }

      drawManyPaths(g, 0); // warm up

      const iterations = 50;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        g.clear();
        drawManyPaths(g, i);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / iterations;

      console.log(`Graphics redraw (500 paths): avg ${avgMs.toFixed(3)}ms per frame`);
      console.log(`Theoretical max FPS: ${(1000 / avgMs).toFixed(0)}`);

      expect(avgMs).toBeLessThan(10);

      g.destroy();
    });
  });

  describe('Given a reactive signal driving Graphics redraw', () => {
    it('then signal update + effect + redraw overhead is negligible', async () => {
      const { signal } = await import('@vertz/ui');
      const { domEffect } = await import('@vertz/ui/internals');
      const g = new Graphics();
      const offset = signal(0);
      let redraws = 0;

      const dispose = domEffect(() => {
        g.clear();
        const o = offset.value;
        for (let i = 0; i < 100; i++) {
          g.rect(i * 10 + o, i * 5, 50, 30);
          g.fill(0xff0000 + i * 100);
        }
        redraws++;
      });

      // Simulate 60 frames of signal updates
      const start = performance.now();
      for (let i = 0; i < 60; i++) {
        offset.value = i;
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / 60;

      console.log(`Signal -> effect -> redraw (100 paths): avg ${avgMs.toFixed(3)}ms per update`);
      console.log(`Redraws triggered: ${redraws}`);

      expect(avgMs).toBeLessThan(5);
      // Effect runs once on init + 60 signal updates = 61 total
      expect(redraws).toBeGreaterThanOrEqual(60);

      dispose();
      g.destroy();
    });
  });
});
