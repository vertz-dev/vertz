import { Sprite as PIXISprite, Texture } from 'pixi.js';
import { onCleanup, useContext } from '@vertz/ui';
import { CanvasContext } from '../runtime/context';
import { bindProp, bindPropCustom, type MaybeReactive } from '../runtime/bind-signal';

export interface SpriteProps {
  x?: MaybeReactive<number>;
  y?: MaybeReactive<number>;
  rotation?: MaybeReactive<number>;
  scale?: MaybeReactive<number>;
  alpha?: MaybeReactive<number>;
  anchor?: MaybeReactive<number>;
  texture: string;
}

/**
 * Sprite component — creates a PixiJS Sprite wired to vertz signals.
 *
 * Static values are set once; signal getters create effects that
 * update the PixiJS property whenever the signal changes.
 */
export function Sprite(props: SpriteProps): DocumentFragment {
  const app = useContext(CanvasContext);
  if (!app) throw new Error('Sprite must be used within a Canvas component');

  const sprite = new PIXISprite(Texture.from(props.texture));
  app.stage.addChild(sprite);

  bindProp(sprite, 'x', props.x);
  bindProp(sprite, 'y', props.y);
  bindProp(sprite, 'rotation', props.rotation);
  bindProp(sprite, 'alpha', props.alpha);
  bindPropCustom(props.scale, (s) => sprite.scale.set(s, s));
  bindPropCustom(props.anchor, (a) => sprite.anchor.set(a, a));

  onCleanup(() => sprite.destroy());

  return document.createDocumentFragment();
}
