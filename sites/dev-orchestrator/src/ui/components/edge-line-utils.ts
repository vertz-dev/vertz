export interface EdgeLineProps {
  readonly fromRow: number;
  readonly toRow: number;
  readonly animated: boolean;
  readonly status?: 'completed' | 'active' | 'pending';
}

export function edgeStrokeColor(status?: string): string {
  switch (status) {
    case 'completed': return 'hsl(142, 76%, 36%)';
    case 'active': return 'hsl(217, 91%, 60%)';
    default: return 'var(--color-border)';
  }
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
