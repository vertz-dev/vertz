import { onCleanup, useContext } from '@vertz/ui';
import type { TickerCallback } from 'pixi.js';
import { CanvasContext } from '../runtime/context';

/**
 * Hook to run a callback on every PixiJS tick (animation frame).
 *
 * The callback receives a delta parameter representing the time
 * elapsed since the last frame.
 *
 * Example:
 * ```tsx
 * const x = signal(0);
 * useTicker((delta) => {
 *   x.set(x() + delta);
 * });
 * ```
 */
export function useTicker(callback: TickerCallback<any>): void {
  const app = useContext(CanvasContext);
  
  if (!app) {
    throw new Error('useTicker must be used within a Canvas component');
  }

  // Add ticker callback
  app.ticker.add(callback);

  // Remove on cleanup
  onCleanup(() => {
    app.ticker.remove(callback);
  });
}
