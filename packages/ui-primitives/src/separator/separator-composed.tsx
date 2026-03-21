import { cn } from '../composed/cn';
import type { ComposedPrimitive } from '../composed/with-styles';

export interface SeparatorClasses {
  base?: string;
  horizontal?: string;
  vertical?: string;
}

export type SeparatorClassKey = keyof SeparatorClasses;

export interface ComposedSeparatorProps {
  classes?: SeparatorClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  orientation?: 'horizontal' | 'vertical';
}

function ComposedSeparatorRoot({
  classes,
  className,
  class: classProp,
  orientation = 'horizontal',
}: ComposedSeparatorProps) {
  const orientationClass = orientation === 'vertical' ? classes?.vertical : classes?.horizontal;
  return <hr class={cn(classes?.base, orientationClass, className ?? classProp)} role="separator" aria-orientation={orientation} />;
}

export const ComposedSeparator: ComposedPrimitive<SeparatorClassKey, HTMLElement> =
  ComposedSeparatorRoot as ComposedPrimitive<SeparatorClassKey, HTMLElement>;
