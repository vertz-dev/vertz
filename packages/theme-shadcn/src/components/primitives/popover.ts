import type { ChildValue } from '@vertz/ui';
import type { ComposedPopoverProps } from '@vertz/ui-primitives';
import { ComposedPopover, withStyles } from '@vertz/ui-primitives';

interface PopoverStyleClasses {
  readonly content: string;
}

// ── Props ──────────────────────────────────────────────────

export interface PopoverRootProps {
  onOpenChange?: (open: boolean) => void;
  children?: ChildValue;
}

export interface PopoverSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedPopoverComponent {
  (props: PopoverRootProps): HTMLElement;
  Trigger: (props: PopoverSlotProps) => HTMLElement;
  Content: (props: PopoverSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedPopover(styles: PopoverStyleClasses): ThemedPopoverComponent {
  const StyledPopover = withStyles(ComposedPopover, {
    content: styles.content,
  });

  function PopoverRoot({ children, onOpenChange }: PopoverRootProps): HTMLElement {
    return StyledPopover({ children, onOpenChange } as ComposedPopoverProps);
  }

  return Object.assign(PopoverRoot, {
    Trigger: ComposedPopover.Trigger,
    Content: ComposedPopover.Content,
  }) as ThemedPopoverComponent;
}
