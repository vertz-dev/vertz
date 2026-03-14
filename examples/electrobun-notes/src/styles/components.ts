import { css } from '@vertz/ui';
import { themeStyles } from './theme';

export const button = themeStyles.button;
export const inputStyles = themeStyles.input;

export const layoutStyles = css({
  shell: ['flex', 'flex-col', 'min-h:screen', 'bg:background'],
  header: [
    'flex',
    'justify:between',
    'items:center',
    'px:6',
    'py:3',
    'bg:card',
    'border-b:1',
    'border:border',
  ],
  main: ['flex-1', 'max-w:2xl', 'mx:auto', 'w:full', 'p:6'],
});

export const formStyles = css({
  error: ['text:xs', 'text:destructive', 'mt:1'],
});

export const noteItemStyles = css({
  item: ['flex', 'flex-col', 'gap:1', 'p:3', 'bg:card', 'rounded:md', 'border:1', 'border:border'],
  title: ['font:medium', 'text:foreground'],
  content: ['text:sm', 'text:muted-foreground'],
});

export const emptyStateStyles = css({
  container: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:12', 'text:center'],
  heading: ['font:lg', 'font:semibold', 'text:foreground', 'mb:1'],
  description: ['text:sm', 'text:muted-foreground', 'mb:4'],
});
