/**
 * Theme configuration for the Linear clone.
 *
 * Uses zinc palette for a clean, neutral dark UI.
 * Exports pre-built component styles (dialog, button, card, input, etc.)
 * from @vertz/theme-shadcn.
 */

import { configureTheme } from '@vertz/theme-shadcn';
import { registerTheme } from '@vertz/ui';

const config = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

registerTheme(config);

export const linearTheme = config.theme;
export const themeGlobals = config.globals;
export const themeStyles = config.styles;
