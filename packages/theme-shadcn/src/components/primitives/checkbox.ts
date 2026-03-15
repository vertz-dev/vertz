import type { ChildValue } from '@vertz/ui';
import type { CheckedState, ComposedCheckboxProps } from '@vertz/ui-primitives';
import { ComposedCheckbox, withStyles } from '@vertz/ui-primitives';

interface CheckboxStyleClasses {
  readonly root: string;
  readonly indicator: string;
}

// ── Props ──────────────────────────────────────────────────

export interface CheckboxRootProps {
  children?: ChildValue;
  defaultChecked?: CheckedState;
  disabled?: boolean;
  onCheckedChange?: (checked: CheckedState) => void;
}

// ── Component type ─────────────────────────────────────────

export type ThemedCheckboxComponent = (props: CheckboxRootProps) => HTMLElement;

// ── Factory ────────────────────────────────────────────────

export function createThemedCheckbox(styles: CheckboxStyleClasses): ThemedCheckboxComponent {
  const StyledCheckbox = withStyles(ComposedCheckbox, {
    root: styles.root,
    indicator: styles.indicator,
  });

  return function CheckboxRoot(props: CheckboxRootProps): HTMLElement {
    return StyledCheckbox(props as ComposedCheckboxProps);
  };
}
