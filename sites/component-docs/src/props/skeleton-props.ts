import type { PropDefinition } from '../types';

export const skeletonProps: PropDefinition[] = [
  {
    name: 'width',
    type: 'string',
    default: '\u2014',
    description: 'Width of the skeleton placeholder.',
  },
  {
    name: 'height',
    type: 'string',
    default: '\u2014',
    description: 'Height of the skeleton placeholder.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
];
