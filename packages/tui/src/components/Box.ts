import type { Color } from '../jsx-runtime/index';
import type { BorderStyle } from '../layout/types';
import type { TuiNode } from '../nodes/types';

export interface BoxProps {
  direction?: 'row' | 'column';
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  gap?: number;
  width?: number | 'full';
  height?: number;
  grow?: number;
  align?: 'start' | 'center' | 'end';
  justify?: 'start' | 'center' | 'end' | 'between';
  border?: BorderStyle;
  borderColor?: Color;
  children?: TuiNode;
}

/**
 * Box — the only layout container.
 * Direction is a prop, not separate Row/Column components.
 */
export function Box(_props: BoxProps): TuiNode {
  // Box is handled by the JSX runtime as an intrinsic element.
  // This function exists for type checking and documentation.
  // The actual rendering is done by the renderer which reads the TuiElement.
  return null;
}
