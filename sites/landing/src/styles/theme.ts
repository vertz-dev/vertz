import { configureTheme } from '@vertz/theme-shadcn';

const { theme, globals } = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

export const landingTheme = theme;
export const themeGlobals = globals;
