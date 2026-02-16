import { Application } from 'pixi.js';
import type { Container } from 'pixi.js';

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
 * Renders a PixiJS canvas to the specified container element.
 */
export function render(container: HTMLElement, options: CanvasOptions): HTMLCanvasElement {
  const app = new Application({
    width: options.width,
    height: options.height,
    backgroundColor: options.backgroundColor ?? 0x000000,
  });

  // Mount the canvas to the container
  container.appendChild(app.view as HTMLCanvasElement);

  return app.view as HTMLCanvasElement;
}

/**
 * Canvas renderer for Vertz with PixiJS integration.
 * Provides reactive primitives for canvas rendering.
 */
export const Canvas = {
  /**
   * Render a PixiJS canvas to the DOM.
   */
  render,
};
