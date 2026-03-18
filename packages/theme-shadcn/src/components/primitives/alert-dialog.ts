import type { ChildValue } from '@vertz/ui';
import { ComposedAlertDialog, withStyles } from '@vertz/ui-primitives';

interface AlertDialogStyleClasses {
  readonly overlay: string;
  readonly panel: string;
  readonly title: string;
  readonly description: string;
  readonly footer: string;
  readonly cancel: string;
  readonly action: string;
}

// ── Props ──────────────────────────────────────────────────

export interface AlertDialogRootProps {
  children?: ChildValue;
  onOpenChange?: (open: boolean) => void;
  onAction?: () => void;
}

export interface AlertDialogSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface AlertDialogButtonSlotProps extends AlertDialogSlotProps {
  onClick?: () => void;
  disabled?: boolean;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedAlertDialogComponent {
  (props: AlertDialogRootProps): HTMLElement;
  Trigger: (props: AlertDialogSlotProps) => HTMLElement;
  Content: (props: AlertDialogSlotProps) => HTMLElement;
  Header: (props: AlertDialogSlotProps) => HTMLElement;
  Title: (props: AlertDialogSlotProps) => HTMLElement;
  Description: (props: AlertDialogSlotProps) => HTMLElement;
  Footer: (props: AlertDialogSlotProps) => HTMLElement;
  Cancel: (props: AlertDialogButtonSlotProps) => HTMLElement;
  Action: (props: AlertDialogButtonSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedAlertDialog(
  styles: AlertDialogStyleClasses,
): ThemedAlertDialogComponent {
  // withStyles pre-binds classes onto the Root. Sub-components read classes
  // from context, so they get styling automatically.
  return withStyles(ComposedAlertDialog, {
    overlay: styles.overlay,
    content: styles.panel,
    cancel: styles.cancel,
    action: styles.action,
    title: styles.title,
    description: styles.description,
    footer: styles.footer,
    header: '',
  }) as unknown as ThemedAlertDialogComponent;
}
