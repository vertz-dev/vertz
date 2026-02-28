import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type DatePickerBlocks = {
  trigger: StyleEntry[];
  content: StyleEntry[];
};

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      property: 'outline',
      value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { property: 'outline-offset', value: '2px' },
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
      'text:sm',
      'font:normal',
      'cursor:pointer',
      'transition:colors',
      focusRing,
      {
        '&': [
          { property: 'height', value: '2.5rem' },
          { property: 'width', value: '100%' },
          { property: 'padding', value: '0.5rem 0.75rem' },
        ],
      },
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-placeholder="true"]': ['text:muted-foreground'] },
    ],
    datePickerContent: [
      'bg:popover',
      'text:popover-foreground',
      'rounded:md',
      'border:1',
      'border:border',
      'shadow:md',
      { '&': [{ property: 'padding', value: '0' }] },
    ],
  });
  return {
    trigger: s.datePickerTrigger,
    content: s.datePickerContent,
    css: s.css,
  } as CSSOutput<DatePickerBlocks>;
}
