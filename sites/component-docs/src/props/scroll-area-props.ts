import type { PropDefinition } from '../types';

export const scrollAreaProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: '"vertical" | "horizontal" | "both"',
    default: '"vertical"',
    description: 'Scrollbar orientation.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Scrollable content.',
  },
];
