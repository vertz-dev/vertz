import type { ChildValue } from '@vertz/ui';
import { ComposedHoverCard } from '@vertz/ui-primitives';

interface HoverCardStyleClasses {
  readonly content: string;
}

// ── Props ──────────────────────────────────────────────────

export interface HoverCardRootProps {
  openDelay?: number;
  closeDelay?: number;
  onOpenChange?: (open: boolean) => void;
  children?: ChildValue;
}

export interface HoverCardSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedHoverCardComponent {
  (props: HoverCardRootProps): HTMLElement;
  Trigger: (props: HoverCardSlotProps) => HTMLElement;
  Content: (props: HoverCardSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedHoverCard(styles: HoverCardStyleClasses): ThemedHoverCardComponent {
  function HoverCardRoot({
    children,
    openDelay,
    closeDelay,
    onOpenChange,
  }: HoverCardRootProps): HTMLElement {
    return ComposedHoverCard({
      children,
      openDelay,
      closeDelay,
      onOpenChange,
      positioning: { placement: 'bottom', portal: true },
      classes: {
        content: styles.content,
      },
    });
  }

  return Object.assign(HoverCardRoot, {
    Trigger: ComposedHoverCard.Trigger,
    Content: ComposedHoverCard.Content,
  });
}
