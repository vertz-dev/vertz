import { globalCss } from '@vertz/ui';

export const appGlobals = globalCss({
  html: {
    scrollBehavior: 'smooth',
  },
  'html body': {
    backgroundColor: 'var(--color-background)',
    fontFamily: 'var(--font-sans)',
    color: 'var(--color-foreground)',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    margin: '0',
    padding: '0',
  },
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
  '*, *::before, *::after': {
    boxSizing: 'border-box',
  },
  '.sidebar-link': {
    display: 'block',
    padding: '4px 24px',
    fontSize: '14px',
    color: 'var(--color-muted-foreground)',
  },
  '.sidebar-link-active': {
    display: 'block',
    padding: '4px 24px',
    fontSize: '14px',
    color: 'var(--color-foreground)',
    fontWeight: '500',
  },
  '.cmd-item': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    color: 'var(--color-foreground)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  '.cmd-item:hover, .cmd-item[data-selected="true"]': {
    backgroundColor: 'var(--color-accent)',
  },
  '.code-block-highlighted pre': {
    margin: '0',
    padding: '16px 48px 16px 16px',
    fontSize: '13px',
    lineHeight: '1.5',
    overflow: 'auto',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono, monospace)',
    backgroundColor: 'var(--color-background) !important',
    color: 'var(--color-foreground)',
  },
  '.code-block-highlighted pre:focus-visible': {
    outline: '2px solid var(--color-primary)',
    outlineOffset: '-2px',
  },
  // Shiki dual-theme: map CSS variables based on active data-theme
  '[data-theme="dark"] .shiki span': {
    color: 'var(--shiki-dark) !important',
  },
  '[data-theme="light"] .shiki span': {
    color: 'var(--shiki-light) !important',
  },
});
