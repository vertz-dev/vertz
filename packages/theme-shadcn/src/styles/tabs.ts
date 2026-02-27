import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type TabsBlocks = {
  list: StyleEntry[];
  trigger: StyleEntry[];
  panel: StyleEntry[];
};

/** Create tabs css() styles. */
export function createTabsStyles(): CSSOutput<TabsBlocks> {
  const s = css({
    tabsList: ['flex', 'items:center', 'border-b:1', 'border:border', 'gap:1'],
    tabsTrigger: [
      'inline-flex',
      'items:center',
      'justify:center',
      'px:3',
      'py:1.5',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'border-b:2',
      'border:transparent',
      'text:muted-foreground',
      'hover:text:foreground',
      {
        '&[data-state="active"]': ['border:primary', 'text:foreground'],
        '&[data-state="inactive"]': ['border:transparent'],
      },
    ],
    tabsPanel: ['pt:4'],
  });
  return {
    list: s.tabsList,
    trigger: s.tabsTrigger,
    panel: s.tabsPanel,
    css: s.css,
  } as CSSOutput<TabsBlocks>;
}
