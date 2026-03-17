/**
 * Theme configuration for the Task Manager app.
 *
 * Uses configureTheme() from @vertz/theme-shadcn for pre-built styles.
 * The theme provides light/dark mode via contextual tokens that swap
 * based on the data-theme attribute set by ThemeProvider.
 */

import { configureTheme } from '@vertz/theme-shadcn';
import { registerTheme } from '@vertz/ui';

const config = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

registerTheme(config);

export const taskManagerTheme = config.theme;
export const themeGlobals = config.globals;
export const themeStyles = config.styles;
