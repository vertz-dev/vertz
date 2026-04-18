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
    datePickerTrigger: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      borderRadius: token.radius.md,
      borderWidth: '1px',
      borderColor: token.color.input,
      backgroundColor: token.color.background,
      color: token.color.foreground,
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.normal,
      cursor: 'pointer',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      ...focusRing,
      '&': { height: '2.5rem', width: '100%', padding: '0.5rem 0.75rem' },
      '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&[data-placeholder="true"]': { color: token.color['muted-foreground'] },
    },
    datePickerContent: {
      backgroundColor: token.color.popover,
      color: token.color['popover-foreground'],
      borderRadius: token.radius.md,
      borderWidth: '1px',
      borderColor: token.color.border,
      boxShadow: token.shadow.md,
      overflow: 'hidden',
      '&': { padding: '0' },
    },
  });
  return {
    trigger: s.datePickerTrigger,
    content: s.datePickerContent,
    css: s.css,
  } as CSSOutput<DatePickerBlocks>;
}
