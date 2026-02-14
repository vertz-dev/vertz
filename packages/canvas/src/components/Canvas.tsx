import { Application } from 'pixi.js';
import { onCleanup, onMount, children as resolveChildren } from '@vertz/ui';
import { CanvasContext } from '../runtime/context';

export interface CanvasProps {
  width: number;
  height: number;
  background?: number;
  children?: any;
}

/**
 * Canvas component - creates a PixiJS Application and renders children
 * into the PixiJS scene graph.
 *
 * Example:
 * ```tsx
 * <Canvas width={800} height={600} background={0x1099bb}>
 *   <Sprite x={100} y={100} texture="bunny.png" />
 * </Canvas>
 * ```
 */
export function Canvas(props: CanvasProps): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  let app: Application | null = null;

  onMount(async () => {
    // Create PixiJS Application
    app = new Application();
    
    await app.init({
      width: props.width,
      height: props.height,
      canvas: canvas,
      background: props.background ?? 0x1099bb,
    });

    // Provide app context to children
    CanvasContext.Provider(app, () => {
      // Resolve and render children
      if (props.children) {
        const childNodes = resolveChildren(() => props.children);
        // Children will add themselves to the stage via context
      }
    });
  });

  onCleanup(() => {
    if (app) {
      app.destroy(true, { children: true });
      app = null;
    }
  });

  return canvas;
}
