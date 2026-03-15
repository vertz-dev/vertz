import type { ChildValue } from '@vertz/ui';
import type { ComposedToggleProps } from '@vertz/ui-primitives';
import { ComposedToggle, withStyles } from '@vertz/ui-primitives';

interface ToggleStyleClasses {
  readonly root: string;
}

// ── Props ──────────────────────────────────────────────────

export interface ToggleRootProps {
  children?: ChildValue;
  defaultPressed?: boolean;
  disabled?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

// ── Component type ─────────────────────────────────────────

export type ThemedToggleComponent = (props: ToggleRootProps) => HTMLElement;

// ── Factory ────────────────────────────────────────────────

export function createThemedToggle(styles: ToggleStyleClasses): ThemedToggleComponent {
  const StyledToggle = withStyles(ComposedToggle, {
    root: styles.root,
  });

  return function ToggleRoot(props: ToggleRootProps): HTMLElement {
    return StyledToggle(props as ComposedToggleProps);
  };
}
