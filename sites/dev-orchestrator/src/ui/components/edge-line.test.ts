import { describe, expect, it } from 'bun:test';
import { edgeCoordinates, NODE_HEIGHT, NODE_GAP } from './edge-line-utils';

describe('edgeCoordinates()', () => {
  it('returns correct y1 and y2 for consecutive rows', () => {
    const { y1, y2 } = edgeCoordinates(0, 1);
    expect(y1).toBe(NODE_HEIGHT); // bottom of row 0
    expect(y2).toBe(NODE_HEIGHT + NODE_GAP); // top of row 1
  });

  it('returns correct coordinates for non-adjacent rows', () => {
    const rowHeight = NODE_HEIGHT + NODE_GAP;
    const { y1, y2 } = edgeCoordinates(1, 3);
    expect(y1).toBe(1 * rowHeight + NODE_HEIGHT);
    expect(y2).toBe(3 * rowHeight);
  });

  it('returns y1 < y2 for sequential steps', () => {
    const { y1, y2 } = edgeCoordinates(0, 1);
    expect(y1).toBeLessThan(y2);
  });
});
