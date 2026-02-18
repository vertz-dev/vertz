import { effect } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { loadSpriteTexture } from './sprite-loading';
import type { CanvasChild, DrawFn } from './types';

const CANVAS_INTRINSICS = new Set(['Graphics', 'Container', 'Sprite', 'Text']);

/** Check if a tag name is a known canvas intrinsic element. */
export function isCanvasIntrinsic(tag: string): boolean {
  return CANVAS_INTRINSICS.has(tag);
}

/**
 * Create a PixiJS display object from a canvas intrinsic tag and props.
 * Handles static props, reactive (accessor) props, event binding,
 * Graphics draw callbacks, children processing, ref escape hatch,
 * and disposal cleanup.
 */
export function jsxCanvas(tag: string, props: Record<string, unknown>): Container {
  const displayObject = createDisplayObject(tag);
  let hasEventProps = false;

  // Text-specific prop handling: 'text' and 'style' need special treatment
  // because they have dedicated semantics on PIXI.Text (reactive text, TextStyle).
  if (displayObject instanceof Text) {
    if ('text' in props) {
      const textValue = props.text;
      if (typeof textValue === 'function') {
        effect(() => {
          (displayObject as Text).text = (textValue as () => string)();
        });
      } else if (textValue !== undefined) {
        (displayObject as Text).text = textValue as string;
      }
    }

    if ('style' in props && props.style !== undefined) {
      (displayObject as Text).style = props.style as import('pixi.js').TextStyleOptions;
    }
  }

  // Sprite-specific: handle string texture via async loading
  if (displayObject instanceof Sprite && 'texture' in props) {
    const textureValue = props.texture;
    if (typeof textureValue === 'string') {
      loadSpriteTexture(displayObject, textureValue);
    } else if (typeof textureValue === 'function') {
      effect(() => {
        const url = (textureValue as () => string)();
        if (typeof url === 'string') {
          loadSpriteTexture(displayObject as Sprite, url);
        }
      });
    }
  }

  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'ref' || key === 'interactive') continue;

    // Skip Text-specific props — handled above
    if (displayObject instanceof Text && (key === 'text' || key === 'style')) continue;

    // Skip Sprite texture prop — handled above via loadSpriteTexture
    if (displayObject instanceof Sprite && key === 'texture') continue;

    if (key === 'draw' && displayObject instanceof Graphics) {
      // Draw callback runs inside effect for reactive redraws.
      // When signals read inside draw() change, the effect re-runs,
      // clearing the graphics before calling draw again.
      effect(() => {
        displayObject.clear();
        (value as DrawFn)(displayObject);
      });
    } else if (key === 'eventMode') {
      // Set eventMode directly as a static string
      displayObject.eventMode = value as Container['eventMode'];
    } else if (key.startsWith('on') && typeof value === 'function') {
      // Event binding: onClick -> click, onPointerDown -> pointerdown
      const event = key.slice(2).toLowerCase();
      const handler = value as (...args: unknown[]) => void;
      displayObject.on(event, handler);
      _tryOnCleanup(() => displayObject.off(event, handler));
      hasEventProps = true;
    } else if (typeof value === 'function') {
      // Reactive prop: bind via effect so display object updates when signal changes
      effect(() => {
        (displayObject as unknown as Record<string, unknown>)[key] = (value as () => unknown)();
      });
    } else if (value !== undefined) {
      // Static prop: set once
      (displayObject as unknown as Record<string, unknown>)[key] = value;
    }
  }

  // Auto-set eventMode to 'static' when event handlers are present
  // unless interactive is explicitly false or eventMode was explicitly set
  if (hasEventProps && props.interactive !== false && !('eventMode' in props)) {
    displayObject.eventMode = 'static';
  }

  // ref escape hatch: call ref with the created display object
  if (props.ref && typeof props.ref === 'function') {
    (props.ref as (obj: Container) => void)(displayObject);
  }

  // Process children — add child display objects to parent
  applyCanvasChildren(displayObject, props.children);

  // Register cleanup: destroy display object when scope disposes
  _tryOnCleanup(() => {
    displayObject.destroy({ children: true });
  });

  return displayObject;
}

/**
 * Add child display objects to a parent container.
 * Handles single children, arrays, and filters out null/undefined/false.
 */
function applyCanvasChildren(parent: Container, children: unknown): void {
  if (children == null || children === false) return;

  if (Array.isArray(children)) {
    for (const child of children) {
      applyCanvasChildren(parent, child);
    }
    return;
  }

  if (children instanceof Container) {
    parent.addChild(children as CanvasChild & Container);
    return;
  }
}

function createDisplayObject(tag: string): Container {
  switch (tag) {
    case 'Graphics':
      return new Graphics();
    case 'Container':
      return new Container();
    case 'Sprite':
      return new Sprite();
    case 'Text':
      return new Text();
    default:
      throw new Error(`Unknown canvas element: <${tag}>`);
  }
}
