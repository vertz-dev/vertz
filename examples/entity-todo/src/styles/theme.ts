/**
 * Theme configuration for the Entity Todo app.
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

export const todoTheme = config.theme;
export const themeGlobals = config.globals;
export const themeStyles = config.styles;
