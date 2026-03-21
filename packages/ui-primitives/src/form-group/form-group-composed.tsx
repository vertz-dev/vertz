/**
 * Composed FormGroup — compound component with context-based class distribution.
 * Sub-components: FormError.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface FormGroupClasses {
  base?: string;
  error?: string;
}

export type FormGroupClassKey = keyof FormGroupClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FormGroupContext = createContext<{ classes?: FormGroupClasses } | undefined>(
  undefined,
  '@vertz/ui-primitives::FormGroupContext',
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

function FormError({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(FormGroupContext);
  return <span class={cn(ctx?.classes?.error, className ?? classProp)}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedFormGroupProps {
  children?: ChildValue;
  classes?: FormGroupClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

function ComposedFormGroupRoot({
  children,
  classes,
  className,
  class: classProp,
}: ComposedFormGroupProps) {
  return (
    <FormGroupContext.Provider value={{ classes }}>
      <div class={cn(classes?.base, className ?? classProp)}>{children}</div>
    </FormGroupContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedFormGroup = Object.assign(ComposedFormGroupRoot, {
  FormError,
}) as ((props: ComposedFormGroupProps) => HTMLElement) & {
  __classKeys?: FormGroupClassKey;
  FormError: (props: SlotProps) => HTMLElement;
};
