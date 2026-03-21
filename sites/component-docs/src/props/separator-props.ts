import type { PropDefinition } from '../types';

export const separatorProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: '"horizontal" | "vertical"',
    default: '"horizontal"',
    description: 'Direction of the separator line.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
];
