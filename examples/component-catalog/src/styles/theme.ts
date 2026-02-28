import { configureTheme } from '@vertz/theme-shadcn';

const { theme, globals, styles, components } = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

export const catalogTheme = theme;
export const themeGlobals = globals;
export const themeStyles = styles;
export const themeComponents = components;
