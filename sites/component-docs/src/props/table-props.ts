import type { PropDefinition } from '../types';

export const tableProps: PropDefinition[] = [
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
    description: 'Table content including TableHeader, TableBody, TableRow, etc.',
  },
];
