import type { PropDefinition } from '../types';

export const breadcrumbProps: PropDefinition[] = [
  {
    name: 'items',
    type: 'BreadcrumbItem[]',
    default: '[]',
    description: 'Array of breadcrumb items to display.',
  },
  {
    name: 'separator',
    type: 'string',
    default: '"/"',
    description: 'Separator character between items.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
];
