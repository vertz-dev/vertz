import type { PropDefinition } from '../types';

export const alertProps: PropDefinition[] = [
  {
    name: 'variant',
    type: '"default" | "destructive"',
    default: '"default"',
    description: 'Visual variant of the alert.',
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
    description: 'Alert content including AlertTitle and AlertDescription.',
  },
];
