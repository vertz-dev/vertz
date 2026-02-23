import type { TuiNode } from '../nodes/types';

/**
 * Spacer — fills remaining space (grow: 1).
 * Used in row layouts to push content to opposite ends.
 */
export function Spacer(_props: Record<string, never>): TuiNode {
  // Spacer is handled by the JSX runtime as an intrinsic element with grow: 1.
  return null;
}
