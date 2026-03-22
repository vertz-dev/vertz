import type { PropDefinition } from '../types';

export const menuProps: PropDefinition[] = [
  {
    name: 'onSelect',
    type: '(value: string) => void',
    default: '\u2014',
    description: 'Callback when a menu item is selected.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the menu opens or closes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Menu content including Trigger and Content sub-components.',
  },
];

export const menuItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Value associated with this item.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Item label content.',
  },
];
