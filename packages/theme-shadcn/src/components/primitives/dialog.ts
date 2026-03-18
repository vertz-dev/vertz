import type { ChildValue } from '@vertz/ui';
import { ComposedDialog, withStyles } from '@vertz/ui-primitives';

interface DialogStyleClasses {
  readonly overlay: string;
  readonly panel: string;
  readonly header: string;
  readonly title: string;
  readonly description: string;
  readonly close: string;
  readonly footer: string;
}

// ── Props ──────────────────────────────────────────────────

export interface DialogRootProps {
  children?: ChildValue;
  onOpenChange?: (open: boolean) => void;
}

export interface DialogSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface DialogContentProps extends DialogSlotProps {
  showClose?: boolean;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedDialogComponent {
  (props: DialogRootProps): HTMLElement;
  Trigger: (props: DialogSlotProps) => HTMLElement;
  Content: (props: DialogContentProps) => HTMLElement;
  Header: (props: DialogSlotProps) => HTMLElement;
  Title: (props: DialogSlotProps) => HTMLElement;
  Description: (props: DialogSlotProps) => HTMLElement;
  Footer: (props: DialogSlotProps) => HTMLElement;
  Close: (props: DialogSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedDialog(styles: DialogStyleClasses): ThemedDialogComponent {
  // withStyles pre-binds classes onto the Root. Sub-components read classes
  // from context, so they get styling automatically.
  return withStyles(ComposedDialog, {
    overlay: styles.overlay,
    content: styles.panel,
    close: styles.close,
    header: styles.header,
    title: styles.title,
    description: styles.description,
    footer: styles.footer,
  }) as unknown as ThemedDialogComponent;
}
