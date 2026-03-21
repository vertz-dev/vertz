import type { PropDefinition } from '../types';

export const datePickerProps: PropDefinition[] = [
  {
    name: 'mode',
    type: '"single" | "range"',
    default: '"single"',
    description: 'Whether to select a single date or a date range.',
  },
  {
    name: 'defaultValue',
    type: 'Date | { from: Date; to: Date }',
    default: '\u2014',
    description: 'Initial selected date or date range.',
  },
  {
    name: 'placeholder',
    type: 'string',
    default: '\u2014',
    description: 'Placeholder text when no date is selected.',
  },
  {
    name: 'formatDate',
    type: '(date: Date) => string',
    default: '\u2014',
    description: 'Custom date formatting function.',
  },
  {
    name: 'minDate',
    type: 'Date',
    default: '\u2014',
    description: 'Minimum selectable date.',
  },
  {
    name: 'maxDate',
    type: 'Date',
    default: '\u2014',
    description: 'Maximum selectable date.',
  },
  {
    name: 'onValueChange',
    type: '(value: Date | { from: Date; to: Date } | null) => void',
    default: '\u2014',
    description: 'Callback when the selected date changes.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    default: '\u2014',
    description: 'Callback when the picker opens or closes.',
  },
  {
    name: 'children',
    type: 'ChildValue',
    default: '\u2014',
    description: 'DatePicker content including Trigger and Content sub-components.',
  },
];
