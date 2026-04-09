import type { ChildValue } from '@vertz/ui';
import { ComposedContextMenu, withStyles } from '@vertz/ui-primitives';

interface ContextMenuStyleClasses {
  readonly content: string;
  readonly item: string;
  readonly group: string;
  readonly label: string;
  readonly separator: string;
}

// ── Props ──────────────────────────────────────────────────

export interface ContextMenuRootProps {
  onSelect?: (value: string) => void;
  children?: ChildValue;
}

export interface ContextMenuSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface ContextMenuItemProps {
  value: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface ContextMenuGroupProps {
  label: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface ContextMenuLabelProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedContextMenuComponent {
  (props: ContextMenuRootProps): HTMLElement;
  Trigger: (props: ContextMenuSlotProps) => HTMLElement;
  Content: (props: ContextMenuSlotProps) => HTMLElement;
  Item: (props: ContextMenuItemProps) => HTMLElement;
  Group: (props: ContextMenuGroupProps) => HTMLElement;
  Label: (props: ContextMenuLabelProps) => HTMLElement;
  Separator: (props: ContextMenuSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedContextMenu(
  styles: ContextMenuStyleClasses,
): ThemedContextMenuComponent {
  const Styled = withStyles(ComposedContextMenu, {
    content: styles.content,
    item: styles.item,
    group: styles.group,
    label: styles.label,
    separator: styles.separator,
  });

  function ContextMenuRoot({ children, onSelect }: ContextMenuRootProps) {
    return (
      <Styled onSelect={onSelect}>
        {children}
      </Styled>
    );
  }

  return Object.assign(ContextMenuRoot, {
    Trigger: ComposedContextMenu.Trigger,
    Content: ComposedContextMenu.Content,
    Item: ComposedContextMenu.Item,
    Group: ComposedContextMenu.Group,
    Label: ComposedContextMenu.Label,
    Separator: ComposedContextMenu.Separator,
  });
}
