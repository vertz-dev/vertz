/**
 * Composed EmptyState — compound component with context-based class distribution.
 * Sub-components: Icon, Title, Description, Action.
 * Used to display a placeholder when a list or section has no content.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface EmptyStateClasses {
  root?: string;
  icon?: string;
  title?: string;
  description?: string;
  action?: string;
}

export type EmptyStateClassKey = keyof EmptyStateClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EmptyStateContext = createContext<{ classes?: EmptyStateClasses } | undefined>(
  undefined,
  '@vertz/ui-primitives::EmptyStateContext',
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

function EmptyStateIcon({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(EmptyStateContext);
  return <div class={cn(ctx?.classes?.icon, className ?? classProp)}>{children}</div>;
}

function EmptyStateTitle({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(EmptyStateContext);
  return <h3 class={cn(ctx?.classes?.title, className ?? classProp)}>{children}</h3>;
}

function EmptyStateDescription({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(EmptyStateContext);
  return <p class={cn(ctx?.classes?.description, className ?? classProp)}>{children}</p>;
}

function EmptyStateAction({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(EmptyStateContext);
  return <div class={cn(ctx?.classes?.action, className ?? classProp)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedEmptyStateProps {
  children?: ChildValue;
  classes?: EmptyStateClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

function ComposedEmptyStateRoot({
  children,
  classes,
  className,
  class: classProp,
}: ComposedEmptyStateProps) {
  return (
    <EmptyStateContext.Provider value={{ classes }}>
      <div class={cn(classes?.root, className ?? classProp)}>{children}</div>
    </EmptyStateContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedEmptyState = Object.assign(ComposedEmptyStateRoot, {
  Icon: EmptyStateIcon,
  Title: EmptyStateTitle,
  Description: EmptyStateDescription,
  Action: EmptyStateAction,
}) as ((props: ComposedEmptyStateProps) => HTMLElement) & {
  __classKeys?: EmptyStateClassKey;
  Icon: (props: SlotProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Action: (props: SlotProps) => HTMLElement;
};
