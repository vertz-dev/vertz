import { signal } from '@vertz/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bind, Canvas } from './canvas';

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

describe('Feature: Reactive Canvas Renderer', () => {
  describe('Given a PixiJS sprite bound to a signal', () => {
    describe('When the signal value changes', () => {
      it('then the sprite property updates automatically', () => {
        // Create a signal for position
        const x = signal(100);

        // Create a mock sprite
        const sprite = { x: 0, y: 0 };

        // Bind the signal to the sprite's x property
        const dispose = bind(sprite, 'x', x);

        // Initially, sprite.x should be updated to signal value
        expect(sprite.x).toBe(100);

        // Update the signal
        x.value = 200;

        // The sprite should automatically update
        expect(sprite.x).toBe(200);

        // Clean up the binding
        dispose();

        // After dispose, changing the signal should NOT update the sprite
        x.value = 300;
        expect(sprite.x).toBe(200);
      });
    });
  });

  describe('Given a mounted canvas application', () => {
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

    describe('When render() is called', () => {
      it('then it mounts the canvas to the DOM and returns a destroy function', () => {
        // Render the canvas - this should return a destroy function
        const destroyFn = Canvas.render(container, { width: 800, height: 600 });

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
        const destroyFn = Canvas.render(container, { width: 800, height: 600 });

        // Call destroy via the returned function
        destroyFn();

        // The app.destroy should have been called with proper options
        expect(mockDestroy).toHaveBeenCalledWith(true, expect.any(Object));
      });
    });
  });
});
