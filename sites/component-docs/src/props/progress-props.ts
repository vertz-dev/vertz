import type { PropDefinition } from '../types';

export const progressProps: PropDefinition[] = [
  {
    name: 'defaultValue',
    type: 'number',
    default: '0',
    description: 'Current progress value.',
  },
  {
    name: 'min',
    type: 'number',
    default: '0',
    description: 'Minimum value.',
  },
  {
    name: 'max',
    type: 'number',
    default: '100',
    description: 'Maximum value.',
  },
];
