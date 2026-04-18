import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type AlertBlocks = {
  root: StyleBlock;
  destructive: StyleBlock;
  title: StyleBlock;
  description: StyleBlock;
};

/** Create alert css() styles. */
export function createAlertStyles(): CSSOutput<AlertBlocks> {
  const s = css({
    alertRoot: {
      position: 'relative',
      width: '100%',
      borderRadius: token.radius.lg,
      borderWidth: '1px',
      borderColor: token.color.border,
      paddingInline: token.spacing['2.5'],
      paddingBlock: token.spacing[2],
      fontSize: token.font.size.sm,
      backgroundColor: token.color.card,
      color: token.color['card-foreground'],
    },
    alertDestructive: { color: token.color.destructive, backgroundColor: token.color.card },
    alertTitle: {
      fontWeight: token.font.weight.medium,
      lineHeight: token.font.lineHeight.none,
      letterSpacing: '-0.025em',
      marginBottom: token.spacing[1],
    },
    alertDescription: {
      color: token.color['muted-foreground'],
      fontSize: token.font.size.sm,
      '&': { lineHeight: '1.625' },
    },
  });
  return {
    root: s.alertRoot,
    destructive: s.alertDestructive,
    title: s.alertTitle,
    description: s.alertDescription,
    css: s.css,
  } as CSSOutput<AlertBlocks>;
}
