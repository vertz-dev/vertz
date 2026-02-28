import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
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
      'h:9',
      'items:center',
      'justify:center',
      'rounded:lg',
      'bg:muted',
      'p:1',
      'text:muted-foreground',
    ],
    tabsTrigger: [
      'inline-flex',
      'items:center',
      'justify:center',
      'whitespace-nowrap',
      'rounded:md',
      'px:3',
      'py:1',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'transition:colors',
      'border:0',
      {
        '&': [{ property: 'background', value: 'transparent' }],
      },
      { '&[data-state="inactive"]': [textOpacity('foreground', 60)] },
      {
        '&[data-state="inactive"]:hover': [textOpacity('foreground', 80)],
      },
      {
        '&[data-state="active"]': ['bg:background', 'text:foreground', 'shadow:sm'],
      },
      {
        [`${DARK} &[data-state="active"]`]: [bgOpacity('input', 30)],
      },
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
    ],
    tabsPanel: ['mt:2'],
    tabsListLine: ['inline-flex', 'h:9', 'items:end', 'gap:4', 'border-b:1', 'border:border'],
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
        '&': [
          { property: 'background', value: 'transparent' },
          { property: 'margin-bottom', value: '-1px' },
          { property: 'transition', value: 'color 150ms, box-shadow 150ms' },
        ],
      },
      { '&[data-state="inactive"]': [textOpacity('foreground', 60)] },
      { '&[data-state="inactive"]:hover': [textOpacity('foreground', 80)] },
      {
        '&[data-state="active"]': [
          'text:foreground',
          {
            property: 'box-shadow',
            value: 'inset 0 -2px 0 0 currentColor',
          },
        ],
      },
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
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
