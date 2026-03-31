import type { PropDefinition } from '../types';

export const accordionProps: PropDefinition[] = [
  {
    name: 'type',
    type: '"single" | "multiple"',
    default: '"single"',
    description: 'Whether one or multiple items can be open at once.',
  },
  {
    name: 'defaultValue',
    type: 'string[]',
    default: '[]',
    description: 'Array of initially open item values.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Accordion items.',
  },
];

export const accordionItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Unique identifier for this accordion item.',
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
    description: 'Item content including Trigger and Content sub-components.',
  },
];
