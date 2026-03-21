import type { PropDefinition } from '../types';

export const breadcrumbProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Breadcrumb.Item[]',
    default: '\u2014',
    description: 'Breadcrumb items as sub-components.',
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
