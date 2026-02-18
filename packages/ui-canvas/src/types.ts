import type { FederatedPointerEvent, Container as PIXIContainer, TextStyleOptions } from 'pixi.js';
import type { MaybeAccessor } from './unwrap';

/** Common transform props shared by all canvas elements. */
export interface CanvasTransformProps {
  x?: MaybeAccessor<number>;
  y?: MaybeAccessor<number>;
  rotation?: MaybeAccessor<number>;
  alpha?: MaybeAccessor<number>;
  scale?: MaybeAccessor<number>;
  visible?: MaybeAccessor<boolean>;
  ref?: (obj: PIXIContainer) => void;
}

/** Pointer event handlers for interactive canvas elements. */
export interface CanvasEventProps {
  onPointerDown?: (e: FederatedPointerEvent) => void;
  onPointerUp?: (e: FederatedPointerEvent) => void;
  onPointerMove?: (e: FederatedPointerEvent) => void;
  onPointerOver?: (e: FederatedPointerEvent) => void;
  onPointerOut?: (e: FederatedPointerEvent) => void;
  onPointerEnter?: (e: FederatedPointerEvent) => void;
  onPointerLeave?: (e: FederatedPointerEvent) => void;
  onClick?: (e: FederatedPointerEvent) => void;
  onRightClick?: (e: FederatedPointerEvent) => void;
  onWheel?: (e: FederatedPointerEvent) => void;
  interactive?: boolean;
  eventMode?: 'static' | 'passive' | 'dynamic' | 'auto' | 'none';
}

/** The type of a function passed to Graphics.draw */
export type DrawFn = (g: import('pixi.js').Graphics) => void;

/** A value that can be a child of a canvas container. */
export type CanvasChild = PIXIContainer | null | undefined | false;

export interface GraphicsProps extends CanvasTransformProps, CanvasEventProps {
  draw: DrawFn;
  children?: never;
}

export interface ContainerProps extends CanvasTransformProps, CanvasEventProps {
  children?: CanvasChild | CanvasChild[];
}

export interface SpriteProps extends CanvasTransformProps, CanvasEventProps {
  texture: MaybeAccessor<string>;
  anchor?: MaybeAccessor<number>;
  width?: MaybeAccessor<number>;
  height?: MaybeAccessor<number>;
}

export interface TextProps extends CanvasTransformProps, CanvasEventProps {
  text: MaybeAccessor<string>;
  style?: Partial<TextStyleOptions>;
}

/** Reserved for Phase 3 accessibility. */
export interface AccessibilityProps {
  label?: string;
  role?: string;
}

/** Map of canvas intrinsic tag names to their prop types. */
export interface CanvasIntrinsicElements {
  Graphics: GraphicsProps;
  Container: ContainerProps;
  Sprite: SpriteProps;
  Text: TextProps;
}
