import { Sprite as PIXISprite, Texture } from 'pixi.js';
import { effect, onCleanup, useContext } from '@vertz/ui';
import { CanvasContext } from '../runtime/context';

export interface SpriteProps {
  x?: number | (() => number);
  y?: number | (() => number);
  rotation?: number | (() => number);
  scale?: number | (() => number);
  alpha?: number | (() => number);
  anchor?: number | (() => number);
  texture: string;
}

/**
 * Sprite component - creates a PixiJS Sprite and adds it to the canvas.
 *
 * Supports reactive properties via signals.
 *
 * Example:
 * ```tsx
 * const x = signal(100);
 * <Sprite x={x()} y={100} texture="bunny.png" />
 * ```
 */
export function Sprite(props: SpriteProps): DocumentFragment {
  const app = useContext(CanvasContext);
  
  if (!app) {
    throw new Error('Sprite must be used within a Canvas component');
  }

  // Create PixiJS Sprite
  const sprite = new PIXISprite(Texture.from(props.texture));
  
  // Add to stage
  app.stage.addChild(sprite);

  // Wire up reactive properties
  // Check if prop is a function (signal getter) or static value
  
  // X position
  if (typeof props.x === 'function') {
    effect(() => {
      sprite.x = (props.x as () => number)();
    });
  } else if (props.x !== undefined) {
    sprite.x = props.x;
  }

  // Y position
  if (typeof props.y === 'function') {
    effect(() => {
      sprite.y = (props.y as () => number)();
    });
  } else if (props.y !== undefined) {
    sprite.y = props.y;
  }

  // Rotation
  if (typeof props.rotation === 'function') {
    effect(() => {
      sprite.rotation = (props.rotation as () => number)();
    });
  } else if (props.rotation !== undefined) {
    sprite.rotation = props.rotation;
  }

  // Scale
  if (typeof props.scale === 'function') {
    effect(() => {
      const s = (props.scale as () => number)();
      sprite.scale.set(s, s);
    });
  } else if (props.scale !== undefined) {
    sprite.scale.set(props.scale, props.scale);
  }

  // Alpha
  if (typeof props.alpha === 'function') {
    effect(() => {
      sprite.alpha = (props.alpha as () => number)();
    });
  } else if (props.alpha !== undefined) {
    sprite.alpha = props.alpha;
  }

  // Anchor (center point)
  if (typeof props.anchor === 'function') {
    effect(() => {
      const a = (props.anchor as () => number)();
      sprite.anchor.set(a, a);
    });
  } else if (props.anchor !== undefined) {
    sprite.anchor.set(props.anchor, props.anchor);
  }

  // Cleanup
  onCleanup(() => {
    sprite.destroy();
  });

  // Return empty fragment (PixiJS renders to canvas, not DOM)
  return document.createDocumentFragment();
}
