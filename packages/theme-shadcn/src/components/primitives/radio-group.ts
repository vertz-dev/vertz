import type { ChildValue } from '@vertz/ui';
import { ComposedRadioGroup, withStyles } from '@vertz/ui-primitives';

interface RadioGroupStyleClasses {
  readonly root: string;
  readonly item: string;
  readonly indicator: string;
}

// ── Props ──────────────────────────────────────────────────

export interface RadioGroupRootProps {
  children?: ChildValue;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export interface RadioGroupItemProps {
  value: string;
  disabled?: boolean;
  children?: ChildValue;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedRadioGroupComponent {
  (props: RadioGroupRootProps): HTMLElement;
  Item: (props: RadioGroupItemProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedRadioGroup(styles: RadioGroupStyleClasses): ThemedRadioGroupComponent {
  const StyledRadioGroup = withStyles(ComposedRadioGroup, {
    root: styles.root,
    item: styles.item,
    indicator: styles.indicator,
  });

  function RadioGroupRoot(props: RadioGroupRootProps): HTMLElement {
    return StyledRadioGroup(props);
  }

  return Object.assign(RadioGroupRoot, {
    Item: ComposedRadioGroup.Item,
  });
}
