import { variants } from '@vertz/ui';

export const button = variants({
  base: ['inline-flex', 'rounded:md', 'font:medium'],
  variants: {
    intent: {
      primary: ['bg:primary', 'text:white'],
      ghost: ['bg:transparent', 'text:foreground'],
    },
    size: {
      sm: ['px:3', 'font:sm'],
      md: ['px:4', 'font:base'],
    },
  },
});
