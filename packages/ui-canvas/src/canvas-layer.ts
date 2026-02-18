import { createContext } from '@vertz/ui';
import type { Container } from 'pixi.js';

/**
 * Context that provides the current PixiJS Container (typically the stage)
 * to canvas children. Canvas intrinsic elements use this to know which
 * container they should add themselves to.
 */
export const CanvasRenderContext = createContext<Container | null>(null);

export interface CanvasLayerProps {
  width: number;
  height: number;
  background?: number;
  debug?: boolean;
  children?: unknown;
}
