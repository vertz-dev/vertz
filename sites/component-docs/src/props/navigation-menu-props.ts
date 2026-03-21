import type { PropDefinition } from '../types';

export const navigationMenuProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: '"horizontal" | "vertical"',
    default: '"horizontal"',
    description: 'Layout direction of the navigation menu.',
  },
  {
    name: 'delayOpen',
    type: 'number',
    default: '\u2014',
    description: 'Delay in milliseconds before opening a sub-menu.',
  },
  {
    name: 'delayClose',
    type: 'number',
    default: '\u2014',
    description: 'Delay in milliseconds before closing a sub-menu.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Navigation menu content including List, Item, and Link sub-components.',
  },
];

export const navigationMenuItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Unique identifier for this navigation item.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Item content including Trigger and Content sub-components.',
  },
];
