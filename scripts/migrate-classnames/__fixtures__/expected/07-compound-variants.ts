import { token, variants } from '@vertz/ui';

export const button = variants({
  base: { display: 'flex' },
  variants: {
    intent: { primary: { backgroundColor: token.color.primary } },
    size: { sm: { paddingInline: token.spacing[3] } },
  },
  compoundVariants: [{ intent: 'primary', size: 'sm', styles: { padding: token.spacing[2], fontWeight: token.font.weight.bold } }],
});
