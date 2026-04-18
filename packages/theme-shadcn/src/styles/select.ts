import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl, bgOpacity, DARK } from './_helpers';

type SelectBlocks = {
  trigger: StyleEntry[];
  content: StyleEntry[];
  item: StyleEntry[];
  itemIndicator: StyleEntry[];
  group: StyleEntry[];
  label: StyleEntry[];
  separator: StyleEntry[];
  scrollButton: StyleEntry[];
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

/** Create select css() styles. */
export function createSelectStyles(): CSSOutput<SelectBlocks> {
  const s = css({
    selectTrigger: {
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      whiteSpace: 'nowrap',
      gap: token.spacing['1.5'],
      borderRadius: token.radius.lg,
      borderWidth: '1px',
      borderColor: token.color.input,
      backgroundColor: 'transparent',
      fontSize: token.font.size.sm,
      cursor: 'pointer',
      '&': {
        height: '2rem',
        paddingTop: '0.5rem',
        paddingBottom: '0.5rem',
        paddingRight: '0.5rem',
        paddingLeft: '0.625rem',
      },
      ...focusRing,
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
      '&[data-state="open"]': { borderColor: token.color.ring },
      [DARK]: bgOpacity('input', 30),
      '& [data-part="chevron"]': {
        opacity: '0.5',
        flexShrink: '0',
        display: 'flex',
        alignItems: 'center',
      },
    },
    selectContent: {
      zIndex: '50',
      overflow: 'hidden',
      backgroundColor: token.color.popover,
      color: token.color['popover-foreground'],
      borderRadius: token.radius.lg,
      padding: token.spacing[1],
      '&': {
        boxShadow:
          '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        minWidth: '9rem',
      },
      '&[data-state="open"][data-side="bottom"]': animationDecl(
        'vz-slide-in-from-top 150ms ease-out forwards',
      ),
      '&[data-state="open"][data-side="top"]': animationDecl(
        'vz-slide-in-from-bottom 150ms ease-out forwards',
      ),
      '&[data-state="open"]:not([data-side])': animationDecl('vz-zoom-in 150ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-zoom-out 150ms ease-out forwards'),
    },
    selectItem: {
      display: 'flex',
      alignItems: 'center',
      gap: token.spacing[2],
      paddingBlock: token.spacing['1.5'],
      fontSize: token.font.size.sm,
      cursor: 'pointer',
      borderRadius: token.radius.md,
      outline: 'none',
      position: 'relative',
      '&': { paddingRight: '2rem', paddingLeft: '0.5rem' },
      '&:hover:not([aria-selected="true"])': {
        backgroundColor: token.color.accent,
        color: token.color['accent-foreground'],
      },
      '&:focus:not([aria-selected="true"])': {
        backgroundColor: token.color.accent,
        color: token.color['accent-foreground'],
      },
      '&[data-disabled]': { pointerEvents: 'none', opacity: '0.5' },
    },
    // Check indicator — absolutely positioned on the right side of the item
    selectItemIndicator: {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      '&': { right: '0.5rem', width: '0.875rem', height: '0.875rem', display: 'none' },
      '[aria-selected="true"] > &': { display: 'flex' },
    },
    // Nova: scroll-my-1 p-1
    selectGroup: { padding: token.spacing[1] },
    // Nova: px-1.5 py-1 text-xs
    selectLabel: {
      paddingInline: token.spacing['1.5'],
      paddingBlock: token.spacing[1],
      fontSize: token.font.size.xs,
      fontWeight: token.font.weight.semibold,
      color: token.color['muted-foreground'],
    },
    // Nova: bg-border -mx-1 my-1 h-px
    selectSeparator: {
      marginBlock: token.spacing[1],
      backgroundColor: token.color.border,
      '&': { marginLeft: '-0.25rem', marginRight: '-0.25rem', height: '1px' },
    },
    selectScrollButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBlock: token.spacing[1],
      cursor: 'default',
    },
  });
  return {
    trigger: s.selectTrigger,
    content: s.selectContent,
    item: s.selectItem,
    itemIndicator: s.selectItemIndicator,
    group: s.selectGroup,
    label: s.selectLabel,
    separator: s.selectSeparator,
    scrollButton: s.selectScrollButton,
    css: s.css,
  } as CSSOutput<SelectBlocks>;
}
