import type { PropDefinition } from '../types';

export const selectProps: PropDefinition[] = [
  {
    name: 'defaultValue',
    type: 'string',
    default: '\u2014',
    description: 'Initial selected value.',
  },
  {
    name: 'placeholder',
    type: 'string',
    default: '\u2014',
    description: 'Placeholder text when no value is selected.',
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
    description: 'Select content including Trigger, Content, and Item sub-components.',
  },
];

export const selectItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Value associated with this item.',
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
    description: 'Item label content.',
  },
];
