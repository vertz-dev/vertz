import type { PropDefinition } from '../types';

export const paginationProps: PropDefinition[] = [
  {
    name: 'page',
    type: 'number',
    default: '1',
    description: 'Current active page number.',
  },
  {
    name: 'totalPages',
    type: 'number',
    default: '\u2014',
    description: 'Total number of pages.',
  },
  {
    name: 'onPageChange',
    type: '(page: number) => void',
    default: '\u2014',
    description: 'Callback when a page is selected.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
];
