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
});
