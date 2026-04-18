import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type DatePickerBlocks = {
  trigger: StyleEntry[];
  content: StyleEntry[];
};

const focusRing: Record<string, StyleValue[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { 'outline-offset': '2px' },
  ],
};

/** Create date-picker css() styles. */
export function createDatePickerStyles(): CSSOutput<DatePickerBlocks> {
  const s = css({
    datePickerTrigger: [
      'inline-flex',
      'items:center',
      'justify:start',
      'rounded:md',
      'border:1',
      'border:input',
      'bg:background',
      'text:foreground',
      'text:sm',
      'font:normal',
      'cursor:pointer',
      'transition:colors',
      focusRing,
      {
        '&': {
          height: '2.5rem',
          width: '100%',
          padding: '0.5rem 0.75rem',
        },
      },
      {
        '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      },
      { '&[data-placeholder="true"]': { color: token.color['muted-foreground'] } },
    ],
    datePickerContent: [
      'bg:popover',
      'text:popover-foreground',
      'rounded:md',
      'border:1',
      'border:border',
      'shadow:md',
      'overflow-hidden',
      { '&': { padding: '0' } },
    ],
  });
  return {
    trigger: s.datePickerTrigger,
    content: s.datePickerContent,
    css: s.css,
  } as CSSOutput<DatePickerBlocks>;
}
