import type { ChildValue } from '@vertz/ui';
import { ComposedDropdownMenu, withStyles } from '@vertz/ui-primitives';

interface DropdownMenuStyleClasses {
  readonly content: string;
  readonly item: string;
  readonly group: string;
  readonly label: string;
  readonly separator: string;
}

// ── Props ──────────────────────────────────────────────────

export interface DropdownMenuRootProps {
  onSelect?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  children?: ChildValue;
}

export interface DropdownMenuSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface DropdownMenuItemProps {
  value: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface DropdownMenuGroupProps {
  label: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface DropdownMenuLabelProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedDropdownMenuComponent {
  (props: DropdownMenuRootProps): HTMLElement;
  Trigger: (props: DropdownMenuSlotProps) => HTMLElement;
  Content: (props: DropdownMenuSlotProps) => HTMLElement;
  Item: (props: DropdownMenuItemProps) => HTMLElement;
  Group: (props: DropdownMenuGroupProps) => HTMLElement;
  Label: (props: DropdownMenuLabelProps) => HTMLElement;
  Separator: (props: DropdownMenuSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedDropdownMenu(
  styles: DropdownMenuStyleClasses,
): ThemedDropdownMenuComponent {
  const Styled = withStyles(ComposedDropdownMenu, {
    content: styles.content,
    item: styles.item,
    group: styles.group,
    label: styles.label,
    separator: styles.separator,
  });

  function DropdownMenuRoot({
    children,
    onSelect,
    onOpenChange,
  }: DropdownMenuRootProps) {
    return (
      <Styled onSelect={onSelect} onOpenChange={onOpenChange}>
        {children}
      </Styled>
    );
  }

  return Object.assign(DropdownMenuRoot, {
    Trigger: ComposedDropdownMenu.Trigger,
    Content: ComposedDropdownMenu.Content,
    Item: ComposedDropdownMenu.Item,
    Group: ComposedDropdownMenu.Group,
    Label: ComposedDropdownMenu.Label,
    Separator: ComposedDropdownMenu.Separator,
  });
}
