import { signal } from '@vertz/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindSignal, Canvas, createReactiveSprite, destroy, render } from './canvas';

// Use vi.hoisted to create mocks that can be referenced in the factory
const { mockDestroy, MockApplication } = vi.hoisted(() => {
  const mockDestroy = vi.fn();

  const mockAppInstance = {
    view: document.createElement('canvas'),
    stage: {
      addChild: vi.fn(),
    },
    render: vi.fn(),
    destroy: mockDestroy,
  };

  // Use a function that can be called with new
  // biome-ignore lint/suspicious/noExplicitAny: Mock constructor typing
  const MockApplication = function (this: typeof mockAppInstance) {
    return mockAppInstance;
  } as unknown as { new (): typeof mockAppInstance };

  return { mockDestroy, MockApplication };
});

vi.mock('pixi.js', () => ({
  Application: MockApplication,
  Container: class {
    addChild() {}
  },
  Graphics: class {},
}));

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

        const { displayObject, dispose } = createReactiveSprite(
          { x, y, scaleX },
          sprite
        );

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

  describe('Feature: Canvas Memory Management', () => {
    describe('Given render() is called', () => {
      describe('When dispose() is called', () => {
        it('then it should cleanup the PixiJS application without error', () => {
          const container = document.createElement('div');

          const { dispose } = render(container, {
            width: 800,
            height: 600,
          });

          // Should have appended canvas
          expect(container.querySelector('canvas')).toBeTruthy();

          // Dispose should not throw
          expect(dispose).not.toThrow();
        });
      });

      describe('When render() is called multiple times', () => {
        it('then each call should return its own dispose function', () => {
          const container1 = document.createElement('div');
          const container2 = document.createElement('div');

          const { dispose: dispose1 } = render(container1, {
            width: 800,
            height: 600,
          });

          const { dispose: dispose2 } = render(container2, {
            width: 800,
            height: 600,
          });

          // Both should work independently
          expect(dispose1).not.toThrow();
          expect(dispose2).not.toThrow();

          // Each dispose should work independently
          dispose1();
          expect(() => dispose2()).not.toThrow();
        });
      });
    });

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

  describe('Feature: Canvas Basic Rendering', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      container.id = 'canvas-container';
      document.body.appendChild(container);

      vi.clearAllMocks();
    });

    afterEach(() => {
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    });

    describe('When rendering a basic scene', () => {
      it('then it should mount the canvas to the DOM', () => {
        const options = {
          width: 800,
          height: 600,
          backgroundColor: 0x1099bb,
        };

        const { canvas } = render(container, options);

        expect(canvas).toBeInstanceOf(HTMLCanvasElement);
        expect(container.contains(canvas)).toBe(true);
      });

      it('then it should return a dispose function', () => {
        const { canvas, dispose } = render(container, {
          width: 800,
          height: 600,
        });

        expect(canvas).toBeInstanceOf(HTMLCanvasElement);
        expect(typeof dispose).toBe('function');
      });
    });

    describe('When render() is called', () => {
      it('then it mounts the canvas to the DOM and returns a destroy function', () => {
        // Render the canvas - this should return a destroy function
        const { dispose: destroyFn } = render(container, { width: 800, height: 600 });

        // The canvas element should be in the DOM
        expect(container.querySelector('canvas')).toBeTruthy();

        // destroyFn should be a function
        expect(typeof destroyFn).toBe('function');

        // Call destroy to clean up
        destroyFn();

        // After destroy, the canvas should be removed from DOM
        expect(container.querySelector('canvas')).toBeFalsy();
      });
    });

    describe('When destroy() is called', () => {
      it('then the PixiJS application is destroyed and resources released', () => {
        // First render to get the app
        const { dispose: destroyFn } = render(container, { width: 800, height: 600 });

        // Call destroy via the returned function
        destroyFn();

        // The app.destroy should have been called with proper options
        expect(mockDestroy).toHaveBeenCalledWith(true, expect.any(Object));
      });
    });
  });
});
