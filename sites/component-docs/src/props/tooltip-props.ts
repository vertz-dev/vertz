import type { PropDefinition } from '../types';

export const tooltipProps: PropDefinition[] = [
  {
    name: 'delay',
    type: 'number',
    default: '\u2014',
    description: 'Delay in milliseconds before the tooltip appears.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Tooltip content including Trigger and Content sub-components.',
  },
];
