import type { Color } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';

export interface TextProps {
  color?: Color;
  bgColor?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  wrap?: 'wrap' | 'truncate' | 'truncate-end';
  children?: TuiNode;
}

/**
 * Text — styled text component.
 * Supports nesting for mixed styles.
 */
export function Text(_props: TextProps): TuiNode {
  // Text is handled by the JSX runtime as an intrinsic element.
  return null;
}
