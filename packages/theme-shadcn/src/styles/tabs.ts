import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { bgOpacity, DARK, textOpacity } from './_helpers';

type TabsBlocks = {
  list: StyleEntry[];
  trigger: StyleEntry[];
  panel: StyleEntry[];
  listLine: StyleEntry[];
  triggerLine: StyleEntry[];
};

/** Create tabs css() styles. */
export function createTabsStyles(): CSSOutput<TabsBlocks> {
  const s = css({
    tabsList: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:lg',
      'bg:muted',
      'text:muted-foreground',
      {
        '&': {
          padding: '3px',
          height: '2rem',
        },
      },
    ],
    tabsTrigger: [
      'inline-flex',
      'items:center',
      'justify:center',
      'whitespace-nowrap',
      'rounded:md',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'transition:colors',
      {
        '&': {
          background: 'transparent',
          padding: '0.125rem 0.375rem',
          border: '1px solid transparent',
        },
      },
      { '&[data-state="inactive"]': [textOpacity('foreground', 60)] },
      {
        '&[data-state="inactive"]:hover': [textOpacity('foreground', 80)],
      },
      {
        '&[data-state="active"]': {
          backgroundColor: token.color.background,
          color: token.color.foreground,
          boxShadow: token.shadow.sm,
        },
      },
      {
        [`${DARK} &[data-state="active"]`]: [bgOpacity('input', 30)],
      },
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
    ],
    tabsPanel: { fontSize: token.font.size.sm, marginTop: token.spacing[2] },
    tabsListLine: {
      display: 'inline-flex',
      height: token.spacing[9],
      alignItems: 'flex-end',
      gap: token.spacing[4],
      borderBottomWidth: '1',
      borderColor: token.color.border,
    },
    tabsTriggerLine: [
      'inline-flex',
      'items:center',
      'justify:center',
      'whitespace-nowrap',
      'px:1',
      'pb:2',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'border:0',
      {
        '&': {
          background: 'transparent',
          'margin-bottom': '-1px',
          transition: 'color 150ms, box-shadow 150ms',
        },
      },
      { '&[data-state="inactive"]': [textOpacity('foreground', 60)] },
      { '&[data-state="inactive"]:hover': [textOpacity('foreground', 80)] },
      {
        '&[data-state="active"]': [
          'text:foreground',
          {
            'box-shadow': 'inset 0 -2px 0 0 currentColor',
          },
        ],
      },
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
    ],
  });
  return {
    list: s.tabsList,
    trigger: s.tabsTrigger,
    panel: s.tabsPanel,
    listLine: s.tabsListLine,
    triggerLine: s.tabsTriggerLine,
    css: s.css,
  } as CSSOutput<TabsBlocks>;
}
