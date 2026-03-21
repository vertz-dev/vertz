import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type EmptyStateBlocks = {
  root: StyleEntry[];
  icon: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  action: StyleEntry[];
};

/** Create empty state css() styles. */
export function createEmptyStateStyles(): CSSOutput<EmptyStateBlocks> {
  return css({
    root: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:12', 'text:center'],
    icon: ['mb:3', 'text:muted-foreground'],
    title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:1'],
    description: ['text:sm', 'text:muted-foreground', 'mb:4', 'max-w:md'],
    action: ['mt:2'],
  });
}
