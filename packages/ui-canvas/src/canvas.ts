import { effect, type Signal } from '@vertz/ui';
import { Application, type Container, type DisplayObject } from 'pixi.js';

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
 * Bind a signal to a display object's property reactively.
 * When the signal changes, the display object property updates automatically.
 * Returns a dispose function to stop the reactivity.
 */
export function bind<T extends DisplayObject, K extends keyof T>(
  target: T,
  property: K,
  signal: Signal<T[K]>,
): () => void {
  // Set initial value
  // Using type assertion is necessary because DisplayObject's index signature
  // doesn't know about the specific property type
  // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic property assignment
  target[property] = signal.value as unknown as T[K];

  // Create an effect that runs whenever the signal changes
  const dispose = effect(() => {
    // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic property assignment
    target[property] = signal.value as unknown as T[K];
  });

  return dispose;
}

/**
 * Renders a PixiJS canvas to the specified container element.
 * Returns a destroy function to clean up resources.
 */
export function render(container: HTMLElement, options: CanvasOptions): () => void {
  const app = new Application({
    width: options.width,
    height: options.height,
    backgroundColor: options.backgroundColor ?? 0x000000,
  });

  // Mount the canvas to the container
  container.appendChild(app.view as HTMLCanvasElement);

  // Return a destroy function that cleans up the application
  return () => destroy(app, container);
}

/**
 * Destroy a PixiJS application and remove its canvas from the DOM.
 */
export function destroy(app: Application, container: HTMLElement): void {
  // PixiJS's ICanvas doesn't extend Node, but the view is always an HTMLCanvasElement
  // when used in browser. Using type assertion for DOM manipulation.
  // biome-ignore lint/suspicious/noExplicitAny: Required for PixiJS/HTMLCanvasElement compatibility
  const view = app.view as unknown as Node | null;

  // Remove canvas from DOM
  if (view && container.contains(view)) {
    container.removeChild(view);
  }

  // Destroy the PixiJS application to release all resources
  app.destroy(true, { children: true, texture: true, baseTexture: true });
}

/**
 * Canvas renderer for Vertz with PixiJS integration.
 * Provides reactive primitives for canvas rendering.
 */
export const Canvas = {
  /**
   * Render a PixiJS canvas to the DOM.
   * Returns a destroy function for cleanup.
   */
  render,

  /**
   * Bind a signal to a display object's property.
   */
  bind,

  /**
   * Destroy a PixiJS application and clean up resources.
   */
  destroy,
};
