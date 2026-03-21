import type { PropDefinition } from '../types';

export const cardProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Card content including sub-components like CardHeader, CardContent, etc.',
  },
];
