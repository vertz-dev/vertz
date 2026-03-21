import type { PropDefinition } from '../types';

export const contextMenuProps: PropDefinition[] = [
  {
    name: 'onSelect',
    type: '(value: string) => void',
    default: '\u2014',
    description: 'Callback when a menu item is selected.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'ContextMenu content including Trigger and Content sub-components.',
  },
];

export const contextMenuItemProps: PropDefinition[] = [
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
