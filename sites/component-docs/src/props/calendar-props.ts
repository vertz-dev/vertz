import type { PropDefinition } from '../types';

export const calendarProps: PropDefinition[] = [
  {
    name: 'mode',
    type: '"single" | "range"',
    default: '"single"',
    description: 'Selection mode for the calendar.',
  },
  {
    name: 'defaultValue',
    type: 'Date | { from: Date; to: Date }',
    default: '\u2014',
    description: 'Initial selected date or date range.',
  },
  {
    name: 'defaultMonth',
    type: 'Date',
    default: '\u2014',
    description: 'Initial month to display.',
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
    name: 'disabled',
    type: '(date: Date) => boolean',
    default: '\u2014',
    description: 'Function to determine if a date should be disabled.',
  },
  {
    name: 'onValueChange',
    type: '(value: Date | { from: Date; to: Date }) => void',
    default: '\u2014',
    description: 'Callback when the selected date changes.',
  },
  {
    name: 'onMonthChange',
    type: '(month: Date) => void',
    default: '\u2014',
    description: 'Callback when the displayed month changes.',
  },
];
