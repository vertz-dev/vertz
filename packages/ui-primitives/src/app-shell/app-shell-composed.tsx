/**
 * Composed AppShell — compound component with context-based class distribution.
 * Sub-components: Sidebar, Brand, Nav, Content, User.
 *
 * Provides a sidebar + content layout for SaaS apps.
 * NavItem is NOT included here — it lives in the themed layer (theme-shadcn)
 * because it wraps Link for SPA navigation (convenience opinion, not structure).
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface AppShellClasses {
  root?: string;
  sidebar?: string;
  brand?: string;
  nav?: string;
  /** Used by the themed NavItem component, not consumed by any primitive sub-component. */
  navItem?: string;
  /** Used by the themed NavItem component, not consumed by any primitive sub-component. */
  navItemActive?: string;
  content?: string;
  user?: string;
}

export type AppShellClassKey = keyof AppShellClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AppShellContext = createContext<{ classes?: AppShellClasses } | undefined>(
  undefined,
  '@vertz/ui-primitives::AppShellContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AppShellSidebar({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <aside data-part="sidebar" class={cn(ctx?.classes?.sidebar, className ?? classProp)}>
      {children}
    </aside>
  );
}

function AppShellBrand({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <div data-part="brand" class={cn(ctx?.classes?.brand, className ?? classProp)}>
      {children}
    </div>
  );
}

function AppShellNav({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <nav data-part="nav" class={cn(ctx?.classes?.nav, className ?? classProp)}>
      {children}
    </nav>
  );
}

function AppShellContent({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <main data-part="content" class={cn(ctx?.classes?.content, className ?? classProp)}>
      {children}
    </main>
  );
}

function AppShellUser({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <div data-part="user" class={cn(ctx?.classes?.user, className ?? classProp)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedAppShellProps {
  children?: ChildValue;
  classes?: AppShellClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

function ComposedAppShellRoot({
  children,
  classes,
  className,
  class: classProp,
}: ComposedAppShellProps) {
  return (
    <AppShellContext.Provider value={{ classes }}>
      <div data-part="app-shell" class={cn(classes?.root, className ?? classProp)}>
        {children}
      </div>
    </AppShellContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedAppShell = Object.assign(ComposedAppShellRoot, {
  Sidebar: AppShellSidebar,
  Brand: AppShellBrand,
  Nav: AppShellNav,
  Content: AppShellContent,
  User: AppShellUser,
}) as ((props: ComposedAppShellProps) => HTMLElement) & {
  __classKeys?: AppShellClassKey;
  Sidebar: (props: SlotProps) => HTMLElement;
  Brand: (props: SlotProps) => HTMLElement;
  Nav: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  User: (props: SlotProps) => HTMLElement;
};
