import type { PropDefinition } from '../types';

export const confirmProps: PropDefinition[] = [
  {
    name: 'title',
    type: 'string',
    default: '\u2014',
    description: 'Title text for the confirmation dialog.',
  },
  {
    name: 'description',
    type: 'string',
    default: '\u2014',
    description: 'Optional description text displayed below the title.',
  },
  {
    name: 'confirm',
    type: 'string',
    default: '"Confirm"',
    description: 'Label for the confirm button.',
  },
  {
    name: 'cancel',
    type: 'string',
    default: '"Cancel"',
    description: 'Label for the cancel button.',
  },
  {
    name: 'intent',
    type: "'primary' | 'danger'",
    default: "'primary'",
    description: 'Visual intent of the confirm button.',
  },
  {
    name: 'dismissible',
    type: 'boolean',
    default: 'false',
    description: 'Whether the dialog can be dismissed by backdrop click or Escape.',
  },
];
