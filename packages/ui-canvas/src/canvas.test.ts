import { signal } from '@vertz/ui';
import { describe, expect, it, vi } from 'vitest';
import { bindSignal, createReactiveSprite } from './canvas';

describe('Feature: Canvas Reactivity', () => {
  describe('Given a signal driving a sprite position', () => {
    describe('When the signal updates', () => {
      it('then the sprite position updates on the next frame', () => {
        // Create signals for position
        const x = signal(100);
        const y = signal(50);

        // Create a mock display object (simulating PixiJS sprite)
        const sprite = {
          x: 0,
          y: 0,
          scale: { x: 1, y: 1 },
          alpha: 1,
          rotation: 0,
        };

        // Bind signals to sprite properties
        const disposeX = bindSignal(x, sprite, 'x');
        const disposeY = bindSignal(y, sprite, 'y');

        // Initial values should be set
        expect(sprite.x).toBe(100);
        expect(sprite.y).toBe(50);

        // Update the signals
        x.value = 200;
        y.value = 75;

        // After signal update, sprite should reflect new values
        expect(sprite.x).toBe(200);
        expect(sprite.y).toBe(75);

        // Cleanup
        disposeX();
        disposeY();
      });
    });
  });

  describe('Given bound signals for multiple properties', () => {
    describe('When any signal updates', () => {
      it('then only the corresponding property updates', () => {
        const rotation = signal(0);
        const alpha = signal(1);

        const displayObject = {
          x: 0,
          y: 0,
          rotation: 0,
          alpha: 1,
          scale: { x: 1, y: 1 },
        };

        const disposeRotation = bindSignal(rotation, displayObject, 'rotation');
        const disposeAlpha = bindSignal(alpha, displayObject, 'alpha');

        // Initial values
        expect(displayObject.rotation).toBe(0);
        expect(displayObject.alpha).toBe(1);

        // Update only rotation
        rotation.value = Math.PI / 2;

        // Rotation updated, alpha unchanged
        expect(displayObject.rotation).toBe(Math.PI / 2);
        expect(displayObject.alpha).toBe(1);

        // Update only alpha
        alpha.value = 0.5;

        // Alpha updated, rotation unchanged
        expect(displayObject.rotation).toBe(Math.PI / 2);
        expect(displayObject.alpha).toBe(0.5);

        disposeRotation();
        disposeAlpha();
      });
    });
  });

  describe('Given createReactiveSprite', () => {
    describe('When creating a sprite with bound signals', () => {
      it('then it returns a display object with working bindings and dispose function', () => {
        const x = signal(10);
        const y = signal(20);
        const scaleX = signal(2);

        // Create a mock display object (simulating PixiJS sprite)
        const sprite = {
          x: 0,
          y: 0,
          scale: { x: 1, y: 1 },
          alpha: 1,
          rotation: 0,
        };

        const { displayObject, dispose } = createReactiveSprite({ x, y, scaleX }, sprite);

        // Initial values set
        expect(displayObject.x).toBe(10);
        expect(displayObject.y).toBe(20);
        expect(displayObject.scale.x).toBe(2);

        // Update signals
        x.value = 100;
        y.value = 200;
        scaleX.value = 3;

        // Values should update reactively
        expect(displayObject.x).toBe(100);
        expect(displayObject.y).toBe(200);
        expect(displayObject.scale.x).toBe(3);

        // Dispose should not throw
        expect(dispose).not.toThrow();
      });
    });
  });

  describe('Issue #444: bindSignal does not redundantly read signal', () => {
    describe('Given a signal bound to a display object with a transform', () => {
      describe('When the signal value changes', () => {
        it('Then the transform is called once per update, not more', () => {
          const sig = signal(5);
          const obj: Record<string, unknown> = { doubled: 0 };
          const transform = vi.fn((v: number) => v * 2);

          const dispose = bindSignal(sig, obj, 'doubled', transform);

          // bindSignal calls update() explicitly + effect runs it immediately = 2 init calls.
          // This is the baseline. The important thing is that each subsequent signal change
          // triggers exactly one additional transform call (not two as with redundant sig.value).
          const initCalls = transform.mock.calls.length;
          expect(obj.doubled).toBe(10);

          // Update signal
          sig.value = 7;
          // Exactly one additional call (from the effect re-running update())
          expect(transform).toHaveBeenCalledTimes(initCalls + 1);
          expect(obj.doubled).toBe(14);

          // Another update
          sig.value = 10;
          expect(transform).toHaveBeenCalledTimes(initCalls + 2);
          expect(obj.doubled).toBe(20);

          dispose();
        });
      });
    });
  });

  describe('Issue #444: destroy is not part of public API', () => {
    describe('Given the public exports from index.ts', () => {
      it('Then destroy is NOT exported as a named export', async () => {
        const exports = await import('./index');
        expect(exports).not.toHaveProperty('destroy');
      });

      it('Then the Canvas namespace does NOT include destroy', async () => {
        const { Canvas } = await import('./index');
        expect(Canvas).not.toHaveProperty('destroy');
      });

      it('Then render, bindSignal, and createReactiveSprite ARE exported', async () => {
        const exports = await import('./index');
        expect(exports).toHaveProperty('render');
        expect(exports).toHaveProperty('bindSignal');
        expect(exports).toHaveProperty('createReactiveSprite');
        expect(exports).toHaveProperty('Canvas');
      });
    });
  });

  describe('Issue #443: @vertz/ui is a peerDependency', () => {
    describe('Given the package.json configuration', () => {
      it('Then @vertz/ui is listed as a peerDependency', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const pkgPath = path.resolve(__dirname, '../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        expect(pkg.peerDependencies).toBeDefined();
        expect(pkg.peerDependencies['@vertz/ui']).toBeDefined();
      });

      it('Then @vertz/ui is NOT in regular dependencies', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const pkgPath = path.resolve(__dirname, '../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        expect(pkg.dependencies?.['@vertz/ui']).toBeUndefined();
      });
    });
  });

  describe('Issue #442: render() exposes app and stage', () => {
    describe('Given the render function return type', () => {
      it('Then the return type includes app and stage properties', async () => {
        const mockCanvas = document.createElement('canvas');
        const mockStage = { label: 'stage' };

        // Reset module cache so our mock takes effect
        vi.resetModules();

        // Mock pixi.js module to avoid real WebGL/Canvas context
        vi.doMock('pixi.js', () => {
          return {
            Application: class MockApplication {
              canvas = mockCanvas;
              stage = mockStage;
              async init() {}
              destroy() {}
            },
            Container: class MockContainer {},
          };
        });

        // Re-import canvas module to pick up mock
        const { render } = await import('./canvas');
        const container = document.createElement('div');
        const result = await render(container, { width: 100, height: 100 });

        expect(result).toHaveProperty('canvas');
        expect(result).toHaveProperty('app');
        expect(result).toHaveProperty('stage');
        expect(result).toHaveProperty('dispose');

        vi.doUnmock('pixi.js');
        vi.resetModules();
      });
    });
  });

  describe('Issue #441: PixiJS v8 API migration', () => {
    describe('Given the render function', () => {
      it('Then render() returns a Promise (is async)', async () => {
        const { render } = await import('./canvas');
        const container = document.createElement('div');
        const result = render(container, { width: 100, height: 100 });
        // In v8, render must be async because app.init() is async
        expect(result).toBeInstanceOf(Promise);
        // PixiJS cannot fully init in happy-dom (no real canvas context),
        // so the promise rejects. We catch it to avoid unhandled rejection.
        await result.catch(() => {});
      });
    });
  });

  describe('Feature: Signal Cleanup', () => {
    describe('Given bound signals', () => {
      describe('When dispose is called', () => {
        it('then the effect subscriptions are cleaned up and no longer update', () => {
          const x = signal(50);

          const sprite = { x: 0, y: 0, scale: { x: 1, y: 1 }, alpha: 1, rotation: 0 };

          const { dispose } = createReactiveSprite({ x }, sprite);

          expect(sprite.x).toBe(50);

          // Dispose the bindings
          dispose();

          // Update signal after dispose - should NOT update display object
          x.value = 100;

          // The value should remain at the old value (50) since effect was disposed
          expect(sprite.x).toBe(50);
        });
      });
    });
  });
});

describe('Issue #445: Integration tests with real PixiJS objects', () => {
  describe('Given a real PixiJS Container', () => {
    it('Then bindSignal updates Container properties reactively', async () => {
      const { Container } = await import('pixi.js');
      const container = new Container();
      const x = signal(42);
      const y = signal(84);

      const disposeX = bindSignal(x, container, 'x');
      const disposeY = bindSignal(y, container, 'y');

      expect(container.x).toBe(42);
      expect(container.y).toBe(84);

      x.value = 100;
      y.value = 200;

      expect(container.x).toBe(100);
      expect(container.y).toBe(200);

      disposeX();
      disposeY();
    });
  });

  describe('Given a real PixiJS Container with alpha and rotation', () => {
    it('Then bindSignal with transform works on real PixiJS objects', async () => {
      const { Container } = await import('pixi.js');
      const container = new Container();
      const degrees = signal(90);

      // Transform degrees to radians
      const dispose = bindSignal(
        degrees,
        container,
        'rotation',
        (deg: number) => (deg * Math.PI) / 180,
      );

      expect(container.rotation).toBeCloseTo(Math.PI / 2);

      degrees.value = 180;
      expect(container.rotation).toBeCloseTo(Math.PI);

      dispose();
    });
  });

  describe('Given a real PixiJS Container used with createReactiveSprite', () => {
    it('Then position signals drive Container position reactively', async () => {
      const { Container } = await import('pixi.js');
      const container = new Container();

      const x = signal(10);
      const y = signal(20);
      const alpha = signal(0.5);

      const { displayObject, dispose } = createReactiveSprite(
        { x, y, alpha },
        container as unknown as Parameters<typeof createReactiveSprite>[1],
      );

      expect(displayObject.x).toBe(10);
      expect(displayObject.y).toBe(20);
      expect(displayObject.alpha).toBe(0.5);

      x.value = 50;
      y.value = 60;
      alpha.value = 1;

      expect(displayObject.x).toBe(50);
      expect(displayObject.y).toBe(60);
      expect(displayObject.alpha).toBe(1);

      dispose();

      // After dispose, updates should not propagate
      x.value = 999;
      expect(displayObject.x).toBe(50);
    });
  });

  describe('Given a mocked PixiJS Application for render lifecycle', () => {
    it('Then render mounts canvas, and dispose removes it and destroys app', async () => {
      const mockCanvas = document.createElement('canvas');
      const mockStage = { label: 'stage' };
      const destroySpy = vi.fn();

      vi.resetModules();
      vi.doMock('pixi.js', () => {
        return {
          Application: class MockApplication {
            canvas = mockCanvas;
            stage = mockStage;
            async init() {}
            destroy = destroySpy;
          },
          Container: class MockContainer {},
        };
      });

      const { render } = await import('./canvas');
      const domContainer = document.createElement('div');
      document.body.appendChild(domContainer);

      // Render: canvas should be added to container
      const result = await render(domContainer, { width: 800, height: 600 });
      expect(domContainer.contains(mockCanvas)).toBe(true);
      expect(result.canvas).toBe(mockCanvas);

      // Dispose: canvas should be removed and app destroyed
      result.dispose();
      expect(domContainer.contains(mockCanvas)).toBe(false);
      expect(destroySpy).toHaveBeenCalledOnce();

      document.body.removeChild(domContainer);
      vi.doUnmock('pixi.js');
      vi.resetModules();
    });
  });
});
