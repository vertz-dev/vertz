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
  navItem?: string;
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
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AppShellSidebar({ children, className }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <aside data-part="sidebar" class={cn(ctx?.classes?.sidebar, className)}>
      {children}
    </aside>
  );
}

function AppShellBrand({ children, className }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <div data-part="brand" class={cn(ctx?.classes?.brand, className)}>
      {children}
    </div>
  );
}

function AppShellNav({ children, className }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <nav data-part="nav" class={cn(ctx?.classes?.nav, className)}>
      {children}
    </nav>
  );
}

function AppShellContent({ children, className }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <main data-part="content" class={cn(ctx?.classes?.content, className)}>
      {children}
    </main>
  );
}

function AppShellUser({ children, className }: SlotProps) {
  const ctx = useContext(AppShellContext);
  return (
    <div data-part="user" class={cn(ctx?.classes?.user, className)}>
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
}

function ComposedAppShellRoot({ children, classes, className }: ComposedAppShellProps) {
  return (
    <AppShellContext.Provider value={{ classes }}>
      <div data-part="app-shell" class={cn(classes?.root, className)}>
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
