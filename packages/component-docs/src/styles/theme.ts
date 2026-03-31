import { configureTheme } from '@vertz/theme-shadcn';
import { font, registerTheme } from '@vertz/ui';

const sans = font('Geist Variable', {
  weight: '100..900',
  src: '/fonts/geist-latin-wght-normal.woff2',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
  unicodeRange:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
});

const config = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

registerTheme(config);

export const docsTheme = { ...config.theme, fonts: { sans } };
export const themeGlobals = config.globals;
export const themeStyles = config.styles;
