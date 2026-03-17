import type { ChildValue } from '@vertz/ui';
import { ComposedCollapsible } from '@vertz/ui-primitives';

interface CollapsibleStyleClasses {
  readonly content: string;
}

// ── Props ──────────────────────────────────────────────────

export interface CollapsibleRootProps {
  defaultOpen?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ChildValue;
}

export interface CollapsibleSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedCollapsibleComponent {
  (props: CollapsibleRootProps): HTMLElement;
  Trigger: (props: CollapsibleSlotProps) => HTMLElement;
  Content: (props: CollapsibleSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedCollapsible(
  styles: CollapsibleStyleClasses,
): ThemedCollapsibleComponent {
  function CollapsibleRoot({
    children,
    defaultOpen,
    disabled,
    onOpenChange,
  }: CollapsibleRootProps): HTMLElement {
    return ComposedCollapsible({
      children,
      defaultOpen,
      disabled,
      onOpenChange,
      classes: {
        content: styles.content,
      },
    });
  }

  return Object.assign(CollapsibleRoot, {
    Trigger: ComposedCollapsible.Trigger,
    Content: ComposedCollapsible.Content,
  });
}
