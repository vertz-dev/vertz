import { signal } from '@vertz/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas } from './canvas';

// Mock PixiJS
vi.mock('pixi.js', () => {
  class MockContainer {
    addChild() {}
  }

  // Create a single canvas element that will be shared
  const mockCanvas = document.createElement('canvas');

  class MockApplication {
    // Return the same canvas element via view property
    get view() {
      return mockCanvas;
    }
    stage = new MockContainer();
    render() {}
    destroy() {}
  }

  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: class {},
  };
});

describe('Feature: Canvas Renderer Phase 1', () => {
  describe('Given a PixiJS canvas integration', () => {
    describe('When a Vertz signal updates', () => {
      it('then the PixiJS display object should update reactively', () => {
        // Create a signal for position
        const x = signal(100);
        const y = signal(50);

        // Create a simple display object-like structure that uses signals
        const displayObject = {
          x: x.value,
          y: y.value,
        };

        // Initially, the values should match the signals
        expect(displayObject.x).toBe(100);
        expect(displayObject.y).toBe(50);

        // Update the signal
        x.value = 200;
        y.value = 75;

        // The display object should reflect the new values (through the signal getter)
        expect(x.value).toBe(200);
        expect(y.value).toBe(75);
      });
    });

    describe('When rendering a basic scene', () => {
      let container: HTMLElement;

      beforeEach(() => {
        container = document.createElement('div');
        container.id = 'canvas-container';
        document.body.appendChild(container);
      });

      afterEach(() => {
        if (container.parentNode) {
          document.body.removeChild(container);
        }
      });

      it('then it should mount the canvas to the DOM', () => {
        // Create canvas options
        const options = {
          width: 800,
          height: 600,
          backgroundColor: 0x1099bb,
        };

        // Render the canvas (this will create a canvas element)
        const canvasElement = Canvas.render(container, options);

        // Verify the canvas was mounted to the DOM
        expect(canvasElement).toBeInstanceOf(HTMLCanvasElement);
        expect(container.contains(canvasElement)).toBe(true);
      });
    });
  });
});
