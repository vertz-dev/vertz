import type { EdgeLineProps } from './edge-line-utils';
import { edgeCoordinates, edgeStrokeColor } from './edge-line-utils';

export type { EdgeLineProps } from './edge-line-utils';

export default function EdgeLine({ fromRow, toRow, animated, status }: EdgeLineProps) {
  const { y1, y2 } = edgeCoordinates(fromRow, toRow);
  const midX = 20;
  const strokeColor = edgeStrokeColor(status);

  return (
    <svg
      style={{
        position: 'absolute',
        left: '0',
        top: '0',
        width: '40px',
        height: `${y2 + 10}px`,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <line
        x1={midX}
        y1={y1}
        x2={midX}
        y2={y2}
        stroke={strokeColor}
        strokeWidth="2"
        strokeDasharray={animated ? '6 4' : status === 'pending' ? '4 4' : 'none'}
      />
      <polygon
        points={`${midX - 4},${y2 - 6} ${midX + 4},${y2 - 6} ${midX},${y2}`}
        fill={strokeColor}
      />
    </svg>
  );
}
