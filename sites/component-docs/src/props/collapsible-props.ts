import type { PropDefinition } from '../types';

export const collapsibleProps: PropDefinition[] = [
  {
    name: 'defaultOpen',
    type: 'boolean',
    default: 'false',
    description: 'Whether the collapsible is initially open.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the collapsible is disabled.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the open state changes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Collapsible content including Trigger and Content sub-components.',
  },
];
