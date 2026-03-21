import type { PropDefinition } from '../types';

export const dialogProps: PropDefinition[] = [
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the dialog opens or closes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Dialog content including Trigger and Content sub-components.',
  },
];

export const dialogContentProps: PropDefinition[] = [
  {
    name: 'showClose',
    type: 'boolean',
    default: 'true',
    description: 'Whether to show the close button.',
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
    description: 'Content to render inside the dialog.',
  },
];
