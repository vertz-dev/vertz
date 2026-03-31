import type { PropDefinition } from '../types';

export const textareaProps: PropDefinition[] = [
  {
    name: 'placeholder',
    type: 'string',
    default: '\u2014',
    description: 'Placeholder text displayed when the textarea is empty.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the textarea is disabled.',
  },
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Current value of the textarea.',
  },
  {
    name: 'rows',
    type: 'number',
    default: '\u2014',
    description: 'Number of visible text rows.',
  },
  {
    name: 'name',
    type: 'string',
    default: '\u2014',
    description: 'HTML name attribute for form submission.',
  },
  {
    name: 'className',
    type: 'string',
    default: '\u2014',
    description: 'Additional CSS classes.',
  },
  {
    name: 'onChange',
    type: '(event: Event) => void',
    default: '\u2014',
    description: 'Change event handler.',
  },
];
