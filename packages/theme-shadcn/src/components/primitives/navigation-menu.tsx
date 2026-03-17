import type { ChildValue } from '@vertz/ui';
import { ComposedNavigationMenu, withStyles } from '@vertz/ui-primitives';

interface NavigationMenuStyleClasses {
  readonly root: string;
  readonly list: string;
  readonly trigger: string;
  readonly content: string;
  readonly link: string;
  readonly viewport: string;
}

// ── Props ──────────────────────────────────────────────────

export interface NavigationMenuRootProps {
  orientation?: 'horizontal' | 'vertical';
  delayOpen?: number;
  delayClose?: number;
  children?: ChildValue;
}

export interface NavigationMenuSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface NavigationMenuItemProps {
  value: string;
  children?: ChildValue;
}

export interface NavigationMenuLinkProps {
  href: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface NavigationMenuViewportProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedNavigationMenuComponent {
  (props: NavigationMenuRootProps): HTMLElement;
  List: (props: NavigationMenuSlotProps) => HTMLElement;
  Item: (props: NavigationMenuItemProps) => HTMLElement;
  Trigger: (props: NavigationMenuSlotProps) => HTMLElement;
  Content: (props: NavigationMenuSlotProps) => HTMLElement;
  Link: (props: NavigationMenuLinkProps) => HTMLElement;
  Viewport: (props: NavigationMenuViewportProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedNavigationMenu(
  styles: NavigationMenuStyleClasses,
): ThemedNavigationMenuComponent {
  const Styled = withStyles(ComposedNavigationMenu, {
    root: styles.root,
    list: styles.list,
    trigger: styles.trigger,
    content: styles.content,
    link: styles.link,
    viewport: styles.viewport,
  });

  function NavigationMenuRoot({
    orientation,
    delayOpen,
    delayClose,
    children,
  }: NavigationMenuRootProps): HTMLElement {
    return Styled({
      children,
      orientation,
      delayOpen,
      delayClose,
    });
  }

  return Object.assign(NavigationMenuRoot, {
    List: ComposedNavigationMenu.List,
    Item: ComposedNavigationMenu.Item,
    Trigger: ComposedNavigationMenu.Trigger,
    Content: ComposedNavigationMenu.Content,
    Link: ComposedNavigationMenu.Link,
    Viewport: ComposedNavigationMenu.Viewport,
  });
}
