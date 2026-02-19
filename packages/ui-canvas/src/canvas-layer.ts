import { type Context, createContext, onCleanup, useContext } from '@vertz/ui';
import { Application, Container } from 'pixi.js';
import { createDebugOverlay } from './debug-overlay';

/**
 * Context that provides the current PixiJS Container (typically the stage)
 * to canvas children. Canvas intrinsic elements use this to know which
 * container they should add themselves to.
 */
export const CanvasRenderContext: Context<Container | null> = createContext<Container | null>(null);

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
  let destroyed = false;

  // Register cleanup synchronously so it's always tracked in the disposal scope
  onCleanup(() => {
    destroyed = true;
    app.destroy(true, { children: true });
  });

  // Async init runs outside onMount to avoid scope issues after await.
  // The destroyed guard prevents operations on an already-disposed app.
  app
    .init({
      width: props.width,
      height: props.height,
      background: props.background ?? 0x000000,
    })
    .then(() => {
      if (destroyed) return;

      div.appendChild(app.canvas as HTMLCanvasElement);

      // Process children via context — child components can useContext(CanvasRenderContext)
      CanvasRenderContext.Provider(app.stage, () => {
        if (props.children != null) {
          const children = Array.isArray(props.children) ? props.children : [props.children];
          for (const child of children) {
            if (child instanceof Container) {
              app.stage.addChild(child);
            }
          }
        }
      });

      // Wire up debug overlay when debug prop is enabled
      if (props.debug) {
        const debug = createDebugOverlay(app.stage);
        app.stage.addChild(debug.overlay);
        debug.update();
      }
    });

  return div;
}
