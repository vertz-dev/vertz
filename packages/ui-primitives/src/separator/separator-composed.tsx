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
  const effectiveCls = className ?? classProp;
  const orientationClass = orientation === 'vertical' ? classes?.vertical : classes?.horizontal;
  const combinedClass = [classes?.base, orientationClass, effectiveCls].filter(Boolean).join(' ');
  return <hr class={combinedClass || undefined} role="separator" aria-orientation={orientation} />;
}

export const ComposedSeparator: ComposedPrimitive<SeparatorClassKey, HTMLElement> =
  ComposedSeparatorRoot as ComposedPrimitive<SeparatorClassKey, HTMLElement>;
