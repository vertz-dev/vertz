import type { PropDefinition } from '../types';

export const hoverCardProps: PropDefinition[] = [
  {
    name: 'openDelay',
    type: 'number',
    default: '\u2014',
    description: 'Delay in milliseconds before opening.',
  },
  {
    name: 'closeDelay',
    type: 'number',
    default: '\u2014',
    description: 'Delay in milliseconds before closing.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the hover card opens or closes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'HoverCard content including Trigger and Content sub-components.',
  },
];
