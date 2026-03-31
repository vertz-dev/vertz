import type { PropDefinition } from '../types';

export const badgeProps: PropDefinition[] = [
  {
    name: 'color',
    type: '"blue" | "green" | "yellow" | "red" | "gray"',
    default: '"gray"',
    description: 'Color variant of the badge.',
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
    description: 'Badge content.',
  },
];
