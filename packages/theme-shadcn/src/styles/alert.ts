import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type AlertBlocks = {
  root: StyleEntry[];
  destructive: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
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
      letterSpacing: 'tight',
      marginBottom: token.spacing[1],
    },
    alertDescription: ['text:muted-foreground', 'text:sm', { '&': { 'line-height': '1.625' } }],
  });
  return {
    root: s.alertRoot,
    destructive: s.alertDestructive,
    title: s.alertTitle,
    description: s.alertDescription,
    css: s.css,
  } as CSSOutput<AlertBlocks>;
}
