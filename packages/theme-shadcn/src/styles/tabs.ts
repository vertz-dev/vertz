import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { bgOpacity, DARK, textOpacity } from './_helpers';

type TabsBlocks = {
  list: StyleEntry[];
  trigger: StyleEntry[];
  panel: StyleEntry[];
  listLine: StyleEntry[];
  triggerLine: StyleEntry[];
};

/** Create tabs css() styles. */
export function createTabsStyles(): CSSOutput<TabsBlocks> {
  const s = css({
    tabsList: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.lg,
      backgroundColor: token.color.muted,
      color: token.color['muted-foreground'],
      '&': { padding: '3px', height: '2rem' },
    },
    tabsTrigger: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      whiteSpace: 'nowrap',
      borderRadius: token.radius.md,
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      cursor: 'pointer',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&': {
        background: 'transparent',
        padding: '0.125rem 0.375rem',
        border: '1px solid transparent',
      },
      '&[data-state="inactive"]': textOpacity('foreground', 60),
      '&[data-state="inactive"]:hover': textOpacity('foreground', 80),
      '&[data-state="active"]': {
        backgroundColor: token.color.background,
        color: token.color.foreground,
        boxShadow: token.shadow.sm,
      },
      [`${DARK} &[data-state="active"]`]: bgOpacity('input', 30),
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
    },
    tabsPanel: { fontSize: token.font.size.sm, marginTop: token.spacing[2] },
    tabsListLine: {
      display: 'inline-flex',
      height: token.spacing[9],
      alignItems: 'flex-end',
      gap: token.spacing[4],
      borderBottomWidth: '1px',
      borderColor: token.color.border,
    },
    tabsTriggerLine: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      whiteSpace: 'nowrap',
      paddingInline: token.spacing[1],
      paddingBottom: token.spacing[2],
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      cursor: 'pointer',
      borderWidth: '0px',
      '&': {
        background: 'transparent',
        marginBottom: '-1px',
        transition: 'color 150ms, box-shadow 150ms',
      },
      '&[data-state="inactive"]': textOpacity('foreground', 60),
      '&[data-state="inactive"]:hover': textOpacity('foreground', 80),
      '&[data-state="active"]': {
        color: token.color.foreground,
        boxShadow: 'inset 0 -2px 0 0 currentColor',
      },
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
    },
  });
  return {
    list: s.tabsList,
    trigger: s.tabsTrigger,
    panel: s.tabsPanel,
    listLine: s.tabsListLine,
    triggerLine: s.tabsTriggerLine,
    css: s.css,
  } as CSSOutput<TabsBlocks>;
}
