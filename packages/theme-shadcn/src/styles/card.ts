import type { CSSOutput } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type CardBlocks = {
  root: string[];
  header: string[];
  title: string[];
  description: string[];
  content: string[];
  footer: string[];
  action: string[];
};

/** Create card css() styles. */
export function createCard(): CSSOutput<CardBlocks> {
  const s = css({
    cardRoot: {
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: token.color.card,
      color: token.color['card-foreground'],
      overflow: 'hidden',
      gap: token.spacing[4],
      paddingBlock: token.spacing[4],
      fontSize: token.font.size.sm,
      '&': {
        borderRadius: 'calc(var(--radius) * 2)',
        boxShadow: '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent)',
      },
    },
    cardHeader: {
      display: 'flex',
      flexDirection: 'column',
      gap: token.spacing[1],
      paddingInline: token.spacing[4],
    },
    cardTitle: {
      fontWeight: token.font.weight.medium,
      '&': { fontSize: '1rem', lineHeight: '1.375' },
    },
    cardDescription: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
    cardContent: { paddingInline: token.spacing[4] },
    cardFooter: {
      display: 'flex',
      alignItems: 'center',
      gap: token.spacing[2],
      padding: token.spacing[4],
      borderTopWidth: '1px',
      borderColor: token.color.border,
      '&': {
        backgroundColor: 'color-mix(in oklch, var(--color-muted) 50%, transparent)',
        borderRadius: '0 0 calc(var(--radius) * 2) calc(var(--radius) * 2)',
        marginBottom: '-1rem',
      },
    },
    cardAction: { marginLeft: 'auto' },
  });
  return {
    root: s.cardRoot,
    header: s.cardHeader,
    title: s.cardTitle,
    description: s.cardDescription,
    content: s.cardContent,
    footer: s.cardFooter,
    action: s.cardAction,
    css: s.css,
  } as CSSOutput<CardBlocks>;
}
