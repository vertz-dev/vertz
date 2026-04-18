import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type CommandBlocks = {
  root: StyleEntry[];
  input: StyleEntry[];
  list: StyleEntry[];
  item: StyleEntry[];
  group: StyleEntry[];
  groupHeading: StyleEntry[];
  separator: StyleEntry[];
  empty: StyleEntry[];
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

/** Create command css() styles. */
export function createCommandStyles(): CSSOutput<CommandBlocks> {
  const s = css({
    commandRoot: {
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRadius: token.radius.lg,
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.popover,
      color: token.color['popover-foreground'],
    },
    commandInput: [
      'flex',
      'w:full',
      'rounded:md',
      'bg:transparent',
      'px:3',
      'py:2',
      'text:sm',
      'outline-none',
      { '&::placeholder': { color: token.color['muted-foreground'] } },
      {
        '&': {
          height: '2.5rem',
          'border-bottom': '1px solid var(--color-border)',
        },
      },
      focusRing,
    ],
    commandList: [
      'px:1',
      'pb:1',
      'pt:2',
      {
        '&': {
          'max-height': '300px',
          'overflow-y': 'auto',
          'overflow-x': 'hidden',
        },
      },
    ],
    commandItem: [
      'flex',
      'items:center',
      'rounded:sm',
      'px:2',
      'text:sm',
      'cursor:pointer',
      {
        '&': {
          'padding-top': '0.375rem',
          'padding-bottom': '0.375rem',
        },
      },
      {
        '&[aria-selected="true"]': {
          backgroundColor: token.color.accent,
          color: token.color['accent-foreground'],
        },
      },
    ],
    commandGroup: { overflow: 'hidden' },
    commandGroupHeading: [
      'px:2',
      'text:xs',
      'font:medium',
      'text:muted-foreground',
      {
        '&': {
          'padding-top': '0.375rem',
          'padding-bottom': '0.375rem',
        },
      },
    ],
    commandSeparator: [
      {
        '&': {
          'margin-left': '-0.25rem',
          'margin-right': '-0.25rem',
          height: '1px',
          'background-color': 'var(--color-border)',
          border: 'none',
        },
      },
    ],
    commandEmpty: {
      paddingBlock: token.spacing[6],
      textAlign: 'center',
      fontSize: token.font.size.sm,
      color: token.color['muted-foreground'],
    },
  });
  return {
    root: s.commandRoot,
    input: s.commandInput,
    list: s.commandList,
    item: s.commandItem,
    group: s.commandGroup,
    groupHeading: s.commandGroupHeading,
    separator: s.commandSeparator,
    empty: s.commandEmpty,
    css: s.css,
  } as CSSOutput<CommandBlocks>;
}
