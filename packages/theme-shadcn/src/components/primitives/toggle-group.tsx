import type { ChildValue } from '@vertz/ui';
import type { ComposedToggleGroupProps } from '@vertz/ui-primitives';
import { ComposedToggleGroup, withStyles } from '@vertz/ui-primitives';

interface ToggleGroupStyleClasses {
  readonly root: string;
  readonly item: string;
}

// -- Props ----------------------------------------------------------

export interface ToggleGroupRootProps {
  children?: ChildValue;
  type?: 'single' | 'multiple';
  defaultValue?: string[];
  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
  onValueChange?: (value: string[]) => void;
}

export interface ToggleGroupItemProps {
  value: string;
  children?: ChildValue;
}

// -- Component type -------------------------------------------------

export interface ThemedToggleGroupComponent {
  (props: ToggleGroupRootProps): HTMLElement;
  Item: (props: ToggleGroupItemProps) => HTMLElement;
}

// -- Factory --------------------------------------------------------

export function createThemedToggleGroup(
  styles: ToggleGroupStyleClasses,
): ThemedToggleGroupComponent {
  const StyledToggleGroup = withStyles(ComposedToggleGroup, {
    root: styles.root,
    item: styles.item,
  });

  function ToggleGroupRoot(props: ToggleGroupRootProps): HTMLElement {
    return StyledToggleGroup(props as ComposedToggleGroupProps);
  }

  return Object.assign(ToggleGroupRoot, {
    Item: ComposedToggleGroup.Item,
  }) as ThemedToggleGroupComponent;
}
