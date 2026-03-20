import { globalCss } from '@vertz/ui';

export const appGlobals = globalCss({
  '@font-face': {
    fontFamily: "'Geist Variable'",
    fontStyle: 'normal',
    fontDisplay: 'swap',
    fontWeight: '100 900',
    src: "url('https://cdn.jsdelivr.net/fontsource/fonts/geist:vf@latest/latin-wght-normal.woff2') format('woff2-variations')",
  },
  html: {
    scrollBehavior: 'smooth',
  },
  'html body': {
    backgroundColor: 'var(--color-background)',
    fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
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
