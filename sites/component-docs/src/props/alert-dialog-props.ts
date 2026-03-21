import type { PropDefinition } from '../types';

export const alertDialogProps: PropDefinition[] = [
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the dialog opens or closes.',
  },
  {
    name: 'onAction',
    type: '() => void',
    default: '\u2014',
    description: 'Callback when the action button is clicked.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'Dialog content including Trigger, Content, and action sub-components.',
  },
];
