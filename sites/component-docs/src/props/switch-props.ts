import type { PropDefinition } from '../types';

export const switchProps: PropDefinition[] = [
  {
    name: 'defaultChecked',
    type: 'boolean',
    default: 'false',
    description: 'Initial checked state of the switch.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the switch is disabled.',
  },
  {
    name: 'size',
    type: '"default" | "sm"',
    default: '"default"',
    description: 'Size of the switch.',
  },
  {
    name: 'onCheckedChange',
    type: '(checked: boolean) => void',
    default: '\u2014',
    description: 'Callback when the checked state changes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Switch content.',
  },
];
