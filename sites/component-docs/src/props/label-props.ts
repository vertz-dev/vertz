import type { PropDefinition } from '../types';

export const labelProps: PropDefinition[] = [
  {
    name: 'for',
    type: 'string',
    default: '\u2014',
    description: 'Associates the label with a form element by its ID.',
  },
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
    description: 'Label text content.',
  },
];
