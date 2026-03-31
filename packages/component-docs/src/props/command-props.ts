import type { PropDefinition } from '../types';

export const commandProps: PropDefinition[] = [
  {
    name: 'placeholder',
    type: 'string',
    default: '\u2014',
    description: 'Placeholder text for the command input.',
  },
  {
    name: 'filter',
    type: '(value: string, search: string) => boolean',
    default: '\u2014',
    description: 'Custom filter function for items.',
  },
  {
    name: 'onSelect',
    type: '(value: string) => void',
    default: '\u2014',
    description: 'Callback when an item is selected.',
  },
  {
    name: 'onInputChange',
    type: '(value: string) => void',
    default: '\u2014',
    description: 'Callback when the search input changes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Command content including Input, List, and Item sub-components.',
  },
];

export const commandItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Value associated with this item.',
  },
  {
    name: 'keywords',
    type: 'string[]',
    default: '\u2014',
    description: 'Additional keywords for filtering.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Item label content.',
  },
];
