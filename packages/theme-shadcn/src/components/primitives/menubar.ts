import type { ChildValue } from '@vertz/ui';
import { ComposedMenubar, withStyles } from '@vertz/ui-primitives';

interface MenubarStyleClasses {
  readonly root: string;
  readonly trigger: string;
  readonly content: string;
  readonly item: string;
  readonly separator: string;
  readonly label: string;
}

// ── Props ──────────────────────────────────────────────────

export interface MenubarRootProps {
  onSelect?: (value: string) => void;
  children?: ChildValue;
}

export interface MenubarMenuProps {
  value: string;
  children?: ChildValue;
}

export interface MenubarSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface MenubarItemProps {
  value: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface MenubarGroupProps {
  label: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface MenubarLabelProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedMenubarComponent {
  (props: MenubarRootProps): HTMLElement;
  Menu: (props: MenubarMenuProps) => HTMLElement;
  Trigger: (props: MenubarSlotProps) => HTMLElement;
  Content: (props: MenubarSlotProps) => HTMLElement;
  Item: (props: MenubarItemProps) => HTMLElement;
  Group: (props: MenubarGroupProps) => HTMLElement;
  Label: (props: MenubarLabelProps) => HTMLElement;
  Separator: (props: MenubarSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedMenubar(styles: MenubarStyleClasses): ThemedMenubarComponent {
  const Styled = withStyles(ComposedMenubar, {
    root: styles.root,
    trigger: styles.trigger,
    content: styles.content,
    item: styles.item,
    group: '',
    label: styles.label,
    separator: styles.separator,
  });

  function MenubarRoot({ children, onSelect }: MenubarRootProps): HTMLElement {
    return Styled({ children, onSelect });
  }

  return Object.assign(MenubarRoot, {
    Menu: ComposedMenubar.Menu,
    Trigger: ComposedMenubar.Trigger,
    Content: ComposedMenubar.Content,
    Item: ComposedMenubar.Item,
    Group: ComposedMenubar.Group,
    Label: ComposedMenubar.Label,
    Separator: ComposedMenubar.Separator,
  });
}
