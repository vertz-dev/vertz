import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

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

/** Create command css() styles. */
export function createCommandStyles(): CSSOutput<CommandBlocks> {
  const s = css({
    commandRoot: [
      'flex',
      'flex-col',
      'overflow-hidden',
      'rounded:lg',
      'border:1',
      'border:border',
      'bg:popover',
      'text:popover-foreground',
    ],
    commandInput: [
      'flex',
      'w:full',
      'rounded:md',
      'bg:transparent',
      'px:3',
      'py:2',
      'text:sm',
      'outline-none',
      { '&::placeholder': ['text:muted-foreground'] },
      {
        '&': [
          { property: 'height', value: '2.5rem' },
          { property: 'border-bottom', value: '1px solid var(--color-border)' },
        ],
      },
      focusRing,
    ],
    commandList: [
      'p:1',
      {
        '&': [
          { property: 'max-height', value: '300px' },
          { property: 'overflow-y', value: 'auto' },
          { property: 'overflow-x', value: 'hidden' },
        ],
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
        '&': [
          { property: 'padding-top', value: '0.375rem' },
          { property: 'padding-bottom', value: '0.375rem' },
        ],
      },
      { '&[aria-selected="true"]': ['bg:accent', 'text:accent-foreground'] },
    ],
    commandGroup: ['overflow-hidden'],
    commandGroupHeading: [
      'px:2',
      'text:xs',
      'font:medium',
      'text:muted-foreground',
      {
        '&': [
          { property: 'padding-top', value: '0.375rem' },
          { property: 'padding-bottom', value: '0.375rem' },
        ],
      },
    ],
    commandSeparator: [
      {
        '&': [
          { property: 'margin-left', value: '-0.25rem' },
          { property: 'margin-right', value: '-0.25rem' },
          { property: 'height', value: '1px' },
          { property: 'background-color', value: 'var(--color-border)' },
          { property: 'border', value: 'none' },
        ],
      },
    ],
    commandEmpty: ['py:6', 'text:center', 'text:sm', 'text:muted-foreground'],
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
