import type { ChildValue } from '@vertz/ui';
import type { ComposedAlertDialogProps } from '@vertz/ui-primitives';
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
  const StyledAlertDialog = withStyles(ComposedAlertDialog, {
    overlay: styles.overlay,
    content: styles.panel,
    cancel: styles.cancel,
    action: styles.action,
    title: styles.title,
    description: styles.description,
    footer: styles.footer,
    header: '',
  });

  function AlertDialogRoot({
    children,
    onOpenChange,
    onAction,
  }: AlertDialogRootProps): HTMLElement {
    return StyledAlertDialog({
      children,
      onOpenChange,
      onAction,
    } as ComposedAlertDialogProps);
  }

  return Object.assign(AlertDialogRoot, {
    Trigger: StyledAlertDialog.Trigger,
    Content: StyledAlertDialog.Content,
    Title: StyledAlertDialog.Title,
    Description: StyledAlertDialog.Description,
    Footer: StyledAlertDialog.Footer,
    Cancel: StyledAlertDialog.Cancel,
    Action: StyledAlertDialog.Action,
  }) as ThemedAlertDialogComponent;
}
