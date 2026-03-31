import type { PropDefinition } from '../types';

export const toastProps: PropDefinition[] = [
  {
    name: 'duration',
    type: 'number',
    default: '5000',
    description: 'Auto-dismiss duration in milliseconds.',
  },
  {
    name: 'position',
    type: 'string',
    default: '"bottom-right"',
    description: 'Position of the toast viewport on screen.',
  },
];
