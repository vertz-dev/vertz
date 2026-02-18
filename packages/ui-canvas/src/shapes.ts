import type { Container } from 'pixi.js';
import { jsxCanvas } from './jsx-canvas';
import type { MaybeAccessor } from './unwrap';
import { unwrap } from './unwrap';

export interface CircleProps {
  x?: MaybeAccessor<number>;
  y?: MaybeAccessor<number>;
  radius: MaybeAccessor<number>;
  fill: MaybeAccessor<number>;
}

export interface RectProps {
  x?: MaybeAccessor<number>;
  y?: MaybeAccessor<number>;
  width: MaybeAccessor<number>;
  height: MaybeAccessor<number>;
  fill: MaybeAccessor<number>;
}

export interface LineProps {
  x?: MaybeAccessor<number>;
  y?: MaybeAccessor<number>;
  from: { x: number; y: number };
  to: { x: number; y: number };
  stroke: MaybeAccessor<number>;
  strokeWidth?: MaybeAccessor<number>;
}

export interface EllipseProps {
  x?: MaybeAccessor<number>;
  y?: MaybeAccessor<number>;
  radiusX: MaybeAccessor<number>;
  radiusY: MaybeAccessor<number>;
  fill: MaybeAccessor<number>;
}

/** Create a circle shape as a Graphics element. */
export function Circle(props: CircleProps): Container {
  return jsxCanvas('Graphics', {
    x: props.x,
    y: props.y,
    draw: (g: import('pixi.js').Graphics) => {
      const r = unwrap(props.radius);
      const color = unwrap(props.fill);
      g.circle(0, 0, r);
      g.fill(color);
    },
  });
}

/** Create a rectangle shape as a Graphics element. */
export function Rect(props: RectProps): Container {
  return jsxCanvas('Graphics', {
    x: props.x,
    y: props.y,
    draw: (g: import('pixi.js').Graphics) => {
      const w = unwrap(props.width);
      const h = unwrap(props.height);
      const color = unwrap(props.fill);
      g.rect(0, 0, w, h);
      g.fill(color);
    },
  });
}

/** Create a line shape as a Graphics element. */
export function Line(props: LineProps): Container {
  return jsxCanvas('Graphics', {
    x: props.x,
    y: props.y,
    draw: (g: import('pixi.js').Graphics) => {
      const color = unwrap(props.stroke);
      const width = unwrap(props.strokeWidth ?? 1);
      g.moveTo(props.from.x, props.from.y);
      g.lineTo(props.to.x, props.to.y);
      g.stroke({ color, width });
    },
  });
}

/** Create an ellipse shape as a Graphics element. */
export function Ellipse(props: EllipseProps): Container {
  return jsxCanvas('Graphics', {
    x: props.x,
    y: props.y,
    draw: (g: import('pixi.js').Graphics) => {
      const rx = unwrap(props.radiusX);
      const ry = unwrap(props.radiusY);
      const color = unwrap(props.fill);
      g.ellipse(0, 0, rx, ry);
      g.fill(color);
    },
  });
}
