import type { PropDefinition } from '../types';

export const emptyStateProps: PropDefinition[] = [
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
    description: 'EmptyState content including Icon, Title, Description, and Action slots.',
  },
];
