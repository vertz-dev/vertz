/**
 * Theme configuration for the Linear clone.
 *
 * Uses zinc palette for a clean, neutral dark UI.
 * Exports pre-built component styles (dialog, button, card, input, etc.)
 * from @vertz/theme-shadcn.
 */

import { configureTheme } from '@vertz/theme-shadcn';

const { theme, globals, styles, components } = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

export const linearTheme = theme;
export const themeGlobals = globals;
export const themeStyles = styles;
export const themeComponents = components;
