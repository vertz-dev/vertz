import { mount } from '@vertz/ui';
import { App, styles } from './app';
import { landingTheme } from './styles/theme';

import.meta.hot?.accept();

// Set dark theme on <html> so CSS variables resolve to dark values globally.
// ThemeProvider only sets data-theme on a nested <div>, but the theme base CSS
// applies body { background-color: var(--color-background) } at the :root scope.
document.documentElement.dataset.theme = 'dark';

mount(App, {
  theme: landingTheme,
  styles,
});
