import type { ChildValue } from '@vertz/ui';
import { cn } from '../composed/cn';
import type { ComposedPrimitive } from '../composed/with-styles';

export interface LabelClasses {
  base?: string;
}

export type LabelClassKey = keyof LabelClasses;

export interface ComposedLabelProps {
  classes?: LabelClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  for?: string;
  children?: ChildValue;
}

function ComposedLabelRoot({
  classes,
  className,
  class: classProp,
  for: htmlFor,
  children,
}: ComposedLabelProps) {
  return (
    <label class={cn(classes?.base, className ?? classProp)} for={htmlFor}>
      {children}
    </label>
  );
}

export const ComposedLabel: ComposedPrimitive<LabelClassKey, HTMLElement> =
  ComposedLabelRoot as ComposedPrimitive<LabelClassKey, HTMLElement>;
