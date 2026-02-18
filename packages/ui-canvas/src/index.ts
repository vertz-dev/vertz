// Phase 1: Canvas primitives
export type { CanvasOptions, CanvasState } from './canvas';
export { bindSignal, Canvas, createReactiveSprite, render } from './canvas';

// Phase 2: Canvas JSX runtime
export { CanvasRenderContext } from './canvas-layer';
export type { CanvasLayerProps } from './canvas-layer';
export { isCanvasIntrinsic, jsxCanvas } from './jsx-canvas';
export { Circle, Ellipse, Line, Rect } from './shapes';
export type { CircleProps, EllipseProps, LineProps, RectProps } from './shapes';
export type {
  AccessibilityProps,
  CanvasChild,
  CanvasEventProps,
  CanvasIntrinsicElements,
  CanvasTransformProps,
  ContainerProps,
  DrawFn,
  GraphicsProps,
  SpriteProps,
  TextProps,
} from './types';
export { canvasConditional } from './canvas-conditional';
export { canvasList } from './canvas-list';
export { createDebugOverlay } from './debug-overlay';
export { loadSpriteTexture } from './sprite-loading';
export type { MaybeAccessor } from './unwrap';
export { unwrap } from './unwrap';
