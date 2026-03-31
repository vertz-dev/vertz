import type { PropDefinition } from '../types';

export const comboboxProps: PropDefinition[] = [
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
    description: 'Callback when an option is selected.',
  },
  {
    name: 'onInputChange',
    type: '(input: string) => void',
    default: '\u2014',
    description: 'Callback when the input text changes, useful for filtering options.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Combobox content including Input, Content, and Option sub-components.',
  },
];

export const comboboxOptionProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Value associated with this option.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Option label content.',
  },
];
