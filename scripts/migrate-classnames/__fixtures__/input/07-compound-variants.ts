import { variants } from '@vertz/ui';

export const button = variants({
  base: ['flex'],
  variants: {
    intent: { primary: ['bg:primary'] },
    size: { sm: ['px:3'] },
  },
  compoundVariants: [{ intent: 'primary', size: 'sm', styles: ['p:2', 'font:bold'] }],
});
