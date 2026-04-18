import { token, variants } from '@vertz/ui';

export const button = variants({
  base: { display: 'inline-flex', borderRadius: token.radius.md, fontWeight: token.font.weight.medium },
  variants: {
    intent: {
      primary: { backgroundColor: token.color.primary, color: 'white' },
      ghost: { backgroundColor: 'transparent', color: token.color.foreground },
    },
    size: {
      sm: { paddingInline: token.spacing[3], fontSize: token.font.size.sm },
      md: { paddingInline: token.spacing[4], fontSize: token.font.size.base },
    },
  },
});
