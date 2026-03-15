import type { ChildValue } from '@vertz/ui';
import type { ComposedTooltipProps } from '@vertz/ui-primitives';
import { ComposedTooltip, withStyles } from '@vertz/ui-primitives';

interface TooltipStyleClasses {
  readonly content: string;
}

// ── Props ──────────────────────────────────────────────────

export interface TooltipRootProps {
  delay?: number;
  children?: ChildValue;
}

export interface TooltipSlotProps {
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedTooltipComponent {
  (props: TooltipRootProps): HTMLElement;
  Trigger: (props: TooltipSlotProps) => HTMLElement;
  Content: (props: TooltipSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedTooltip(styles: TooltipStyleClasses): ThemedTooltipComponent {
  const StyledTooltip = withStyles(ComposedTooltip, {
    content: styles.content,
  });

  function TooltipRoot({ children, delay }: TooltipRootProps): HTMLElement {
    return StyledTooltip({ children, delay } as ComposedTooltipProps);
  }

  return Object.assign(TooltipRoot, {
    Trigger: ComposedTooltip.Trigger,
    Content: ComposedTooltip.Content,
  }) as ThemedTooltipComponent;
}
