import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type CommandBlocks = {
  root: StyleBlock;
  input: StyleBlock;
  list: StyleBlock;
  item: StyleBlock;
  group: StyleBlock;
  groupHeading: StyleBlock;
  separator: StyleBlock;
  empty: StyleBlock;
};

const focusRing: StyleBlock = {
  '&:focus-visible': {
    outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    outlineOffset: '2px',
  },
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
    commandInput: {
      display: 'flex',
      width: '100%',
      borderRadius: token.radius.md,
      backgroundColor: 'transparent',
      paddingInline: token.spacing[3],
      paddingBlock: token.spacing[2],
      fontSize: token.font.size.sm,
      outline: 'none',
      '&::placeholder': { color: token.color['muted-foreground'] },
      '&': { height: '2.5rem', borderBottom: '1px solid var(--color-border)' },
      ...focusRing,
    },
    commandList: {
      paddingInline: token.spacing[1],
      paddingBottom: token.spacing[1],
      paddingTop: token.spacing[2],
      '&': { maxHeight: '300px', overflowY: 'auto', overflowX: 'hidden' },
    },
    commandItem: {
      display: 'flex',
      alignItems: 'center',
      borderRadius: token.radius.sm,
      paddingInline: token.spacing[2],
      fontSize: token.font.size.sm,
      cursor: 'pointer',
      '&': { paddingTop: '0.375rem', paddingBottom: '0.375rem' },
      '&[aria-selected="true"]': {
        backgroundColor: token.color.accent,
        color: token.color['accent-foreground'],
      },
    },
    commandGroup: { overflow: 'hidden' },
    commandGroupHeading: {
      paddingInline: token.spacing[2],
      fontSize: token.font.size.xs,
      fontWeight: token.font.weight.medium,
      color: token.color['muted-foreground'],
      '&': { paddingTop: '0.375rem', paddingBottom: '0.375rem' },
    },
    commandSeparator: {
      '&': {
        marginLeft: '-0.25rem',
        marginRight: '-0.25rem',
        height: '1px',
        backgroundColor: 'var(--color-border)',
        border: 'none',
      },
    },
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
