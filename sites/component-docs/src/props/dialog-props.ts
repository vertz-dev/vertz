import type { PropDefinition } from '../types';

export const dialogProps: PropDefinition[] = [
  {
    name: 'dialog',
    type: 'DialogHandle<T>',
    default: '\u2014',
    description: 'Handle provided by DialogStack to close the dialog with a result.',
  },
  {
    name: 'dismissible',
    type: 'boolean',
    default: 'true',
    description: 'Whether the dialog can be dismissed by backdrop click or Escape.',
  },
];
