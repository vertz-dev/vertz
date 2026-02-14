import { signal, type Signal } from './signal';

export interface NodeData {
  id: number;
  x: Signal<number>;
  y: Signal<number>;
  color: string;
  label: string;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
  '#F8B739', '#52B788', '#E76F51', '#264653'
];

export function generateNodes(count: number, width: number, height: number): NodeData[] {
  const nodes: NodeData[] = [];
  
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: i,
      x: signal(Math.random() * (width - 60) + 10),
      y: signal(Math.random() * (height - 60) + 10),
      color: COLORS[i % COLORS.length],
      label: `${i}`,
    });
  }
  
  return nodes;
}

export function randomizePositions(nodes: NodeData[], width: number, height: number) {
  for (const node of nodes) {
    node.x.value = Math.random() * (width - 60) + 10;
    node.y.value = Math.random() * (height - 60) + 10;
  }
}
