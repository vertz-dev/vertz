import { type DisposeFn, effect, type Signal } from '@vertz/ui';
import { Application, type Container } from 'pixi.js';

export interface CanvasOptions {
  width: number;
  height: number;
  backgroundColor?: number;
}

export interface CanvasState {
  app: Application;
  root: Container;
}

/**
 * Binds a Vertz signal to a PixiJS display object property reactively.
 * When the signal updates, the display object property updates automatically.
 */
export function bindSignal<T>(
  sig: Signal<T>,
  displayObject: { [key: string]: unknown },
  property: string,
  transform?: (value: T) => unknown,
): DisposeFn {
  const update = () => {
    const value = transform ? transform(sig.value) : sig.value;
    (displayObject as Record<string, unknown>)[property] = value;
  };

  // Run immediately to set initial value
  update();

  // Create an effect to update when signal changes
  // We read sig.value inside the effect to track the signal dependency
  const disposeEffect = effect(() => {
    sig.value; // Track this signal
    update();
  });

  return disposeEffect;
}

/**
 * Creates a reactive sprite-like display object that binds to position signals.
 * Returns the display object with bound properties and a cleanup function.
 */
export function createReactiveSprite(
  options: {
    x?: Signal<number>;
    y?: Signal<number>;
    rotation?: Signal<number>;
    scaleX?: Signal<number>;
    scaleY?: Signal<number>;
    alpha?: Signal<number>;
  },
  displayObject: {
    x: number;
    y: number;
    rotation: number;
    scale: { x: number; y: number };
    alpha: number;
  },
): { displayObject: typeof displayObject; dispose: DisposeFn } {
  const cleanups: DisposeFn[] = [];

  if (options.x) {
    cleanups.push(bindSignal(options.x, displayObject, 'x'));
  }

  if (options.y) {
    cleanups.push(bindSignal(options.y, displayObject, 'y'));
  }

  if (options.rotation) {
    cleanups.push(bindSignal(options.rotation, displayObject, 'rotation'));
  }

  if (options.scaleX) {
    cleanups.push(
      bindSignal(options.scaleX, displayObject.scale as unknown as Record<string, unknown>, 'x'),
    );
  }

  if (options.scaleY) {
    cleanups.push(
      bindSignal(options.scaleY, displayObject.scale as unknown as Record<string, unknown>, 'y'),
    );
  }

  if (options.alpha) {
    cleanups.push(bindSignal(options.alpha, displayObject, 'alpha'));
  }

  return {
    displayObject,
    dispose: () => cleanups.forEach((fn) => fn()),
  };
}

/**
 * Renders a PixiJS canvas to the specified container element.
 * Returns the canvas element and a dispose function for cleanup.
 */
export function render(
  container: HTMLElement,
  options: CanvasOptions,
): { canvas: HTMLCanvasElement; dispose: DisposeFn } {
  const app = new Application({
    width: options.width,
    height: options.height,
    backgroundColor: options.backgroundColor ?? 0x000000,
  });

  // Mount the canvas to the container
  container.appendChild(app.view as HTMLCanvasElement);

  // Create dispose function for cleanup
  const dispose = () => {
    destroy(app, container);
  };

  return {
    canvas: app.view as HTMLCanvasElement,
    dispose,
  };
}

/**
 * Destroy a PixiJS application and remove its canvas from the DOM.
 */
export function destroy(app: Application, container: HTMLElement): void {
  const view = app.view as unknown as Node | null;

  // Remove canvas from DOM
  if (view && container.contains(view)) {
    container.removeChild(view);
  }

  // Destroy the PixiJS application to release all resources
  app.destroy(true, { children: true, texture: true });
}

/**
 * Canvas renderer for Vertz with PixiJS integration.
 * Provides reactive primitives for canvas rendering.
 */
export const Canvas: {
  render: typeof render;
  bindSignal: typeof bindSignal;
  createReactiveSprite: typeof createReactiveSprite;
  destroy: typeof destroy;
} = {
  /**
   * Render a PixiJS canvas to the DOM.
   */
  render: render,

  /**
   * Bind a Vertz signal to a PixiJS display object property.
   */
  bindSignal: bindSignal,

  /**
   * Create a reactive sprite with bound position/transform signals.
   */
  createReactiveSprite: createReactiveSprite,

  /**
   * Destroy a PixiJS application and clean up resources.
   */
  destroy: destroy,
};
