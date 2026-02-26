/**
 * Type test: SSRModule exports from app.tsx
 *
 * Verifies that app.tsx exports the SSRModule interface (App, theme, styles)
 * so createDevServer can use it in ssrModule mode.
 */
import { App, styles, theme } from './app';

// Verify App is a component factory
const _app: () => unknown = App;

// Verify theme is present
const _theme: object = theme;

// Verify styles is a string array
const _styles: string[] = styles;
