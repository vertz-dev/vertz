import { css } from '@vertz/ui';

export const layoutStyles = css({
  shell: ['flex', { '&': [{ property: 'height', value: '100vh' }] }],
  sidebar: ['w:64', 'border-r:1', 'border:border', 'pt:4', 'pb:4', 'pl:4', 'pr:1', 'bg:card', 'flex', 'flex-col', { '&': [{ property: 'height', value: '100vh' }, { property: 'overflow', value: 'hidden' }] }],
  main: ['flex-1', 'p:6', { '&': [{ property: 'height', value: '100vh' }, { property: 'overflow', value: 'hidden' }] }],
});

export const scrollStyles = css({
  thin: [
    {
      '&': [
        { property: 'scrollbar-width', value: 'thin' },
        { property: 'scrollbar-color', value: 'var(--color-border) transparent' },
      ],
      '&::-webkit-scrollbar': [{ property: 'width', value: '6px' }],
      '&::-webkit-scrollbar-track': [{ property: 'background', value: 'transparent' }],
      '&::-webkit-scrollbar-thumb': [
        { property: 'background', value: 'var(--color-border)' },
        { property: 'border-radius', value: '3px' },
      ],
      '&::-webkit-scrollbar-thumb:hover': [
        { property: 'background', value: 'var(--color-muted-foreground)' },
      ],
    },
  ],
});

export const navStyles = css({
  title: ['font:xl', 'font:bold', 'text:foreground', 'mb:2'],
  subtitle: ['text:xs', 'text:muted-foreground', 'mb:4'],
  categoryTitle: [
    'font:xs',
    'font:semibold',
    'text:muted-foreground',
    'uppercase',
    'tracking:wider',
    'mt:4',
    'mb:1',
    'px:2',
  ],
  navItem: [
    'flex',
    'items:center',
    'text:sm',
    'px:2',
    'py:1',
    'rounded:md',
    'text:muted-foreground',
    'hover:text:foreground',
    'hover:bg:accent',
    'transition:colors',
    'cursor:pointer',
  ],
  navItemActive: ['text:foreground', 'bg:accent', 'font:medium'],
  themeToggle: [
    'flex',
    'items:center',
    'gap:2',
    'text:sm',
    'text:muted-foreground',
    'hover:text:foreground',
    'transition:colors',
    'cursor:pointer',
    'mt:auto',
    'pt:4',
    'border-t:1',
    'border:border',
    'px:2',
  ],
});

export const demoStyles = css({
  demoBox: [
    'border:1',
    'border:border',
    'rounded:lg',
    'p:6',
    'bg:card',
  ],
  demoLabel: ['font:lg', 'font:semibold', 'text:foreground', 'mb:4'],
  demoDescription: ['text:sm', 'text:muted-foreground', 'mb:6'],
  section: ['mb:8'],
  sectionTitle: ['font:sm', 'font:medium', 'text:muted-foreground', 'mb:3'],
  row: ['flex', 'flex-wrap', 'items:center', 'gap:3'],
  col: ['flex', 'flex-col', 'gap:4'],
});

export const homeStyles = css({
  title: ['font:3xl', 'font:bold', 'text:foreground', 'mb:2'],
  subtitle: ['text:muted-foreground', 'mb:8'],
  grid: ['grid', 'grid-cols:3', 'gap:4'],
  categoryCard: [
    'border:1',
    'border:border',
    'rounded:lg',
    'p:4',
    'bg:card',
    'hover:bg:accent',
    'transition:colors',
    'cursor:pointer',
  ],
  categoryName: ['font:base', 'font:semibold', 'text:foreground'],
  categoryCount: ['text:sm', 'text:muted-foreground'],
});
