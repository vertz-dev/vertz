import type { PropDefinition } from '../types';

export const inputProps: PropDefinition[] = [
  {
    name: 'type',
    type: 'string',
    default: '"text"',
    description: 'HTML input type (text, password, email, etc.).',
  },
  {
    name: 'placeholder',
    type: 'string',
    default: '\u2014',
    description: 'Placeholder text displayed when the input is empty.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    default: 'false',
    description: 'Whether the input is disabled.',
  },
  {
    name: 'value',
    type: 'string',
    default: '\u2014',
    description: 'Current value of the input.',
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
