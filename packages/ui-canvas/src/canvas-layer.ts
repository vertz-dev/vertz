import { createContext, onCleanup, onMount, useContext } from '@vertz/ui';
import { Application, type Container } from 'pixi.js';

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

/**
 * Bridge component that embeds a PixiJS canvas inside the DOM tree.
 * Creates a PixiJS Application, provides the stage via CanvasRenderContext,
 * and processes canvas children.
 *
 * Nesting CanvasLayer inside another CanvasLayer is forbidden and throws.
 */
export function CanvasLayer(props: CanvasLayerProps): HTMLDivElement {
  // Forbid nesting
  const parentCtx = useContext(CanvasRenderContext);
  if (parentCtx) {
    throw new Error(
      '<CanvasLayer> cannot be nested inside another <CanvasLayer>. Use <Container> to group canvas elements.',
    );
  }

  const div = document.createElement('div');
  const app = new Application();

  onMount(async () => {
    await app.init({
      width: props.width,
      height: props.height,
      background: props.background ?? 0x000000,
    });
    div.appendChild(app.canvas as HTMLCanvasElement);

    // Process children — add canvas display objects to the stage
    if (props.children != null) {
      const children = Array.isArray(props.children) ? props.children : [props.children];
      for (const child of children) {
        if (child instanceof (await import('pixi.js')).Container) {
          app.stage.addChild(child);
        }
      }
    }
  });

  onCleanup(() => {
    app.destroy(true, { children: true });
  });

  return div;
}
