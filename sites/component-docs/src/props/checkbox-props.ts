import type { PropDefinition } from '../types';

export const checkboxProps: PropDefinition[] = [
  {
    name: 'defaultChecked',
    type: 'boolean | "mixed"',
    default: 'false',
    description: 'Initial checked state of the checkbox.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the checkbox is disabled.',
  },
  {
    name: 'onCheckedChange',
    type: '(checked: CheckedState) => void',
    default: '\u2014',
    description: 'Callback when the checked state changes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Checkbox content.',
  },
];
