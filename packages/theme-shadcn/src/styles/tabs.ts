import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK, textOpacity } from './_helpers';

type TabsBlocks = {
  list: StyleEntry[];
  trigger: StyleEntry[];
  panel: StyleEntry[];
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
      { '&[data-state="inactive"]': [textOpacity('foreground', 60)] },
      {
        '&[data-state="active"]': ['bg:background', 'text:foreground', 'shadow:sm'],
      },
      {
        [`${DARK} &[data-state="active"]`]: [bgOpacity('input', 30)],
      },
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
    ],
    tabsPanel: ['mt:2'],
  });
  return {
    list: s.tabsList,
    trigger: s.tabsTrigger,
    panel: s.tabsPanel,
    css: s.css,
  } as CSSOutput<TabsBlocks>;
}
