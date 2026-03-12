import { hydrateIslands } from '@vertz/ui';

// Set dark theme on <html> so CSS variables resolve to dark values globally.
// ThemeProvider only sets data-theme on a nested <div>, but the theme base CSS
// applies body { background-color: var(--color-background) } at the :root scope.
document.documentElement.dataset.theme = 'dark';

hydrateIslands({
  CopyButton: () => import('./components/copy-button'),
});
