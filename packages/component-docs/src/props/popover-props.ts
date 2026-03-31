import type { PropDefinition } from '../types';

export const popoverProps: PropDefinition[] = [
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the popover opens or closes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Popover content including Trigger and Content sub-components.',
  },
];
