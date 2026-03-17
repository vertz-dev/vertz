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

// ── Component type ─────────────────────────────────────────

export interface ThemedDialogComponent {
  (props: DialogRootProps): HTMLElement;
  Trigger: (props: DialogSlotProps) => HTMLElement;
  Content: (props: DialogSlotProps) => HTMLElement;
  Header: (props: DialogSlotProps) => HTMLElement;
  Title: (props: DialogSlotProps) => HTMLElement;
  Description: (props: DialogSlotProps) => HTMLElement;
  Footer: (props: DialogSlotProps) => HTMLElement;
  Close: (props: DialogSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedDialog(styles: DialogStyleClasses): ThemedDialogComponent {
  const StyledDialog = withStyles(ComposedDialog, {
    overlay: styles.overlay,
    content: styles.panel,
    close: styles.close,
    header: styles.header,
    title: styles.title,
    description: styles.description,
    footer: styles.footer,
  });

  function DialogRoot({ children, onOpenChange }: DialogRootProps): HTMLElement {
    // Create a themed close icon (Lucide X SVG)
    const closeIcon = document.createElement('button');
    closeIcon.type = 'button';
    closeIcon.className = styles.close;
    closeIcon.setAttribute('aria-label', 'Close');
    closeIcon.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

    return StyledDialog({
      children,
      onOpenChange,
      closeIcon,
    });
  }

  return Object.assign(DialogRoot, {
    Trigger: StyledDialog.Trigger,
    Content: StyledDialog.Content,
    Header: StyledDialog.Header,
    Title: StyledDialog.Title,
    Description: StyledDialog.Description,
    Footer: StyledDialog.Footer,
    Close: StyledDialog.Close,
  });
}
