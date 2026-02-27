/**
 * Theme configuration for the Task Manager app.
 *
 * Uses configureTheme() from @vertz/theme-shadcn for pre-built styles.
 * The theme provides light/dark mode via contextual tokens that swap
 * based on the data-theme attribute set by ThemeProvider.
 */

import { configureTheme } from '@vertz/theme-shadcn';

const { theme, globals, styles, components } = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

export const taskManagerTheme = theme;
export const themeGlobals = globals;
export const themeStyles = styles;
export const themeComponents = components;
