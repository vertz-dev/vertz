import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type EmptyStateBlocks = {
  root: StyleEntry[];
  icon: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  action: StyleEntry[];
};

/** Create empty state css() styles. */
export function createEmptyStateStyles(): CSSOutput<EmptyStateBlocks> {
  return css({
    root: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBlock: token.spacing[12],
      textAlign: 'center',
    },
    icon: { marginBottom: token.spacing[3], color: token.color['muted-foreground'] },
    title: {
      fontSize: token.font.size.lg,
      fontWeight: token.font.weight.semibold,
      color: token.color.foreground,
      marginBottom: token.spacing[1],
    },
    description: {
      fontSize: token.font.size.sm,
      color: token.color['muted-foreground'],
      marginBottom: token.spacing[4],
      maxWidth: '28rem',
    },
    action: { marginTop: token.spacing[2] },
  });
}
