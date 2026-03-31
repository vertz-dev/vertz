import type { PropDefinition } from '../types';

export const radioGroupProps: PropDefinition[] = [
  {
    name: 'defaultValue',
    type: 'string',
    default: '\u2014',
    description: 'Initial selected value.',
  },
  {
    name: 'onValueChange',
    type: '(value: string) => void',
    default: '\u2014',
    description: 'Callback when the selected value changes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'RadioGroup content including Item sub-components.',
  },
];

export const radioGroupItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Value associated with this radio item.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether this radio item is disabled.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Radio item label content.',
  },
];
