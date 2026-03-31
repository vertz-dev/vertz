import type { PropDefinition } from '../types';

export const buttonProps: PropDefinition[] = [
  {
    name: 'intent',
    type: '"primary" | "secondary" | "destructive" | "ghost" | "outline" | "link"',
    default: '"primary"',
    description: 'Visual style variant of the button.',
  },
  {
    name: 'size',
    type: '"xs" | "sm" | "md" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"',
    default: '"md"',
    description: 'Size of the button.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the button is disabled.',
  },
  {
    name: 'type',
    type: '"button" | "submit" | "reset"',
    default: '"button"',
    description: 'HTML button type attribute.',
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
    description: 'Button content.',
  },
  {
    name: 'onClick',
    type: '(event: MouseEvent) => void',
    default: '\u2014',
    description: 'Click event handler.',
  },
];
