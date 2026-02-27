import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type TabsBlocks = {
  list: StyleEntry[];
  trigger: StyleEntry[];
  panel: StyleEntry[];
};

/** Create tabs css() styles. */
export function createTabsStyles(): CSSOutput<TabsBlocks> {
  return css({
    list: ['flex', 'items:center', 'border-b:1', 'border:border', 'gap:1'],
    trigger: [
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
    panel: ['pt:4'],
  });
}
