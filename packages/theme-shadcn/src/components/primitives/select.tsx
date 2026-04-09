import type { ChildValue } from '@vertz/ui';
import { ComposedSelect, withStyles } from '@vertz/ui-primitives';

interface SelectStyleClasses {
  readonly trigger: string;
  readonly content: string;
  readonly item: string;
  readonly itemIndicator: string;
  readonly group: string;
  readonly label: string;
  readonly separator: string;
}

// ── Props ──────────────────────────────────────────────────

export interface SelectRootProps {
  defaultValue?: string;
  placeholder?: string;
  onValueChange?: (value: string) => void;
  children?: ChildValue;
}

export interface SelectSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface SelectItemProps {
  value: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface SelectGroupProps {
  label: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedSelectComponent {
  (props: SelectRootProps): HTMLElement;
  Trigger: (props: SelectSlotProps) => HTMLElement;
  Content: (props: SelectSlotProps) => HTMLElement;
  Item: (props: SelectItemProps) => HTMLElement;
  Group: (props: SelectGroupProps) => HTMLElement;
  Separator: (props: SelectSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedSelect(styles: SelectStyleClasses): ThemedSelectComponent {
  const StyledSelect = withStyles(ComposedSelect, {
    trigger: styles.trigger,
    content: styles.content,
    item: styles.item,
    itemIndicator: styles.itemIndicator,
    group: styles.group,
    label: styles.label,
    separator: styles.separator,
  });

  function SelectRoot({
    defaultValue,
    placeholder,
    onValueChange,
    children,
  }: SelectRootProps) {
    return (
      <StyledSelect
        defaultValue={defaultValue}
        placeholder={placeholder}
        onValueChange={onValueChange}
      >
        {children}
      </StyledSelect>
    );
  }

  return Object.assign(SelectRoot, {
    Trigger: ComposedSelect.Trigger,
    Content: ComposedSelect.Content,
    Item: ComposedSelect.Item,
    Group: ComposedSelect.Group,
    Separator: ComposedSelect.Separator,
  });
}
