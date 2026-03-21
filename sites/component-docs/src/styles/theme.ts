import { configureTheme } from '@vertz/theme-shadcn';
import { registerTheme } from '@vertz/ui';

const config = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

registerTheme(config);

export const docsTheme = config.theme;
export const themeGlobals = config.globals;
export const themeStyles = config.styles;
