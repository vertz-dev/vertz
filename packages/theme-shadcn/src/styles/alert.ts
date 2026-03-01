import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type AlertBlocks = {
  root: StyleEntry[];
  destructive: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
};

/** Create alert css() styles. */
export function createAlertStyles(): CSSOutput<AlertBlocks> {
  const s = css({
    alertRoot: [
      'relative',
      'w:full',
      'rounded:lg',
      'border:1',
      'border:border',
      'px:2.5',
      'py:2',
      'text:sm',
      'bg:card',
      'text:card-foreground',
    ],
    alertDestructive: ['text:destructive', 'bg:card'],
    alertTitle: ['font:medium', 'leading:none', 'tracking:tight', 'mb:1'],
    alertDescription: [
      'text:muted-foreground',
      'text:sm',
      { '&': [{ property: 'line-height', value: '1.625' }] },
    ],
  });
  return {
    root: s.alertRoot,
    destructive: s.alertDestructive,
    title: s.alertTitle,
    description: s.alertDescription,
    css: s.css,
  } as CSSOutput<AlertBlocks>;
}
