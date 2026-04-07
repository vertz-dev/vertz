export interface EdgeLineProps {
  readonly fromRow: number;
  readonly toRow: number;
  readonly animated: boolean;
}

export const NODE_HEIGHT = 52;
export const NODE_GAP = 8;

/**
 * Compute the SVG line coordinates for an edge between two rows.
 * Returns y1 (start) and y2 (end) in pixel coordinates.
 */
export function edgeCoordinates(fromRow: number, toRow: number): { y1: number; y2: number } {
  const rowHeight = NODE_HEIGHT + NODE_GAP;
  const y1 = fromRow * rowHeight + NODE_HEIGHT;
  const y2 = toRow * rowHeight;
  return { y1, y2 };
}
