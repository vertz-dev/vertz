import type { PropDefinition } from '../types';

export const menubarProps: PropDefinition[] = [
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
    description: 'Menubar content including Menu sub-components.',
  },
];

export const menubarMenuProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Unique identifier for this menu.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Menu content including Trigger, Content, and Item sub-components.',
  },
];
