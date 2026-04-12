import type { ChildValue } from '@vertz/ui';
import { isBrowser, useRouter } from '@vertz/ui';
import type { ComposedAppShellProps } from '@vertz/ui-primitives';
import { ComposedAppShell, withStyles } from '@vertz/ui-primitives';
// ── Style classes ─────────────────────────────────────────

export interface AppShellStyleClasses {
  readonly root: string;
  readonly sidebar: string;
  readonly brand: string;
  readonly nav: string;
  readonly navItem: string;
  readonly navItemActive: string;
  readonly content: string;
  readonly user: string;
}

// ── Props ─────────────────────────────────────────────────

interface SlotProps {
  children?: ChildValue;
  className?: string;
}

/** Icon component type — matches @vertz/icons signature. */
type IconComponent = (props: { size?: number }) => HTMLElement;

/**
 * Themed nav link with automatic active state and optional icon.
 * Provides SPA navigation via the router.
 */
export interface AppShellNavItemProps {
  /** Target URL path. */
  href: string;
  children?: ChildValue;
  /** Icon component from @vertz/icons, rendered at 16px before the label. */
  icon?: IconComponent;
  /**
   * Active state matching strategy.
   * - `'prefix'` (default): active when pathname starts with href
   * - `'exact'`: active only on exact pathname match
   */
  match?: 'exact' | 'prefix';
  className?: string;
}

// ── Component type ────────────────────────────────────────

export interface ThemedAppShellComponent {
  (props: ComposedAppShellProps): HTMLElement;
  Sidebar: (props: SlotProps) => HTMLElement;
  Brand: (props: SlotProps) => HTMLElement;
  Nav: (props: SlotProps) => HTMLElement;
  NavItem: (props: AppShellNavItemProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  User: (props: SlotProps) => HTMLElement;
}

// ── NavItem factory ───────────────────────────────────────

function createThemedNavItem(
  navItemClass: string,
  navItemActiveClass: string,
): (props: AppShellNavItemProps) => HTMLElement {
  return function ThemedNavItem({
    href,
    children,
    icon,
    match = 'prefix',
    className,
  }: AppShellNavItemProps): HTMLElement {
    const router = useRouter();

    const handleClick = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      router.navigate({ to: href });
    };

    // Reactive active state — reads router.current to trigger reactive tracking.
    // The compiler wraps JSX attribute expressions in getters, so this re-evaluates
    // when the route changes.
    const checkActive = (): boolean => {
      void router.current;
      if (!isBrowser()) return false;
      const pathname = window.location.pathname;
      return match === 'prefix' ? pathname.startsWith(href) : pathname === href;
    };

    return (
      <a
        href={href}
        data-part="nav-item"
        data-active={checkActive() ? 'true' : undefined}
        data-match={match}
        aria-current={checkActive() ? 'page' : undefined}
        class={[navItemClass, checkActive() ? navItemActiveClass : '', className]
          .filter(Boolean)
          .join(' ')}
        onClick={handleClick}
      >
        {icon && <span data-part="icon">{icon({ size: 16 })}</span>}
        {children}
      </a>
    ) as HTMLElement;
  };
}

// ── Factory ───────────────────────────────────────────────

export function createThemedAppShell(styles: AppShellStyleClasses): ThemedAppShellComponent {
  const Styled = withStyles(ComposedAppShell, {
    root: styles.root,
    sidebar: styles.sidebar,
    brand: styles.brand,
    nav: styles.nav,
    navItem: styles.navItem,
    navItemActive: styles.navItemActive,
    content: styles.content,
    user: styles.user,
  });
  const NavItem = createThemedNavItem(styles.navItem, styles.navItemActive);

  return Object.assign(Styled, { NavItem }) as ThemedAppShellComponent;
}
