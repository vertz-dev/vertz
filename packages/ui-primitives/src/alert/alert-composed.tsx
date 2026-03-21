/**
 * Composed Alert — compound component with context-based class distribution.
 * Sub-components: Title, Description.
 * Root has role="alert" and supports variant-based styling via classes.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface AlertClasses {
  root?: string;
  title?: string;
  description?: string;
}

export type AlertClassKey = keyof AlertClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AlertContext = createContext<{ classes?: AlertClasses } | undefined>(
  undefined,
  '@vertz/ui-primitives::AlertContext',
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

function AlertTitle({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AlertContext);
  return <h5 class={cn(ctx?.classes?.title, className ?? classProp)}>{children}</h5>;
}

function AlertDescription({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AlertContext);
  return <div class={cn(ctx?.classes?.description, className ?? classProp)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedAlertProps {
  children?: ChildValue;
  classes?: AlertClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

function ComposedAlertRoot({ children, classes, className, class: classProp }: ComposedAlertProps) {
  return (
    <AlertContext.Provider value={{ classes }}>
      <div role="alert" class={cn(classes?.root, className ?? classProp)}>
        {children}
      </div>
    </AlertContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedAlert = Object.assign(ComposedAlertRoot, {
  Title: AlertTitle,
  Description: AlertDescription,
}) as ((props: ComposedAlertProps) => HTMLElement) & {
  __classKeys?: AlertClassKey;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
};
