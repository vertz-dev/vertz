import { configureTheme } from '@vertz/theme-shadcn';
import { font, type Theme } from '@vertz/ui';

const { theme, globals } = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

const sans = font('DM Sans', {
  weight: '100..1000',
  src: [
    {
      path: '/public/fonts/dm-sans-latin.woff2',
      weight: '100..1000',
      style: 'normal',
    },
    {
      path: '/public/fonts/dm-sans-italic-latin.woff2',
      weight: '100..1000',
      style: 'italic',
    },
  ],
  fallback: ['system-ui', 'sans-serif'],
  unicodeRange:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
});

const display = font('DM Serif Display', {
  weight: 400,
  src: '/public/fonts/dm-serif-display-latin.woff2',
  fallback: ['Georgia', 'serif'],
  unicodeRange:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
});

const mono = font('JetBrains Mono', {
  weight: '100..800',
  src: '/public/fonts/jetbrains-mono-latin.woff2',
  fallback: ['monospace'],
  unicodeRange:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
});

export const landingTheme: Theme = { ...theme, fonts: { sans, display, mono } };
export const themeGlobals = globals;
