import { mount } from '@vertz/ui';
import { App, getInitialTheme, styles } from './app';
import { initHighlighter } from './lib/highlighter';
import { docsTheme } from './styles/theme';

import.meta.hot.accept();

document.documentElement.dataset.theme = getInitialTheme();

mount(App, {
  theme: docsTheme,
  styles,
});

// Initialize Shiki AFTER hydration completes so signal updates
// don't interfere with the hydration cursor.
initHighlighter();
