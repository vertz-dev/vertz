import type { ChildValue } from '@vertz/ui';
import { cn } from '../composed/cn';
import type { ComposedPrimitive } from '../composed/with-styles';

export interface BadgeClasses {
  base?: string;
}

export type BadgeClassKey = keyof BadgeClasses;

export interface ComposedBadgeProps {
  classes?: BadgeClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
  style?: Record<string, string | number>;
  [key: string]: unknown;
}

function ComposedBadgeRoot({
  classes,
  className,
  class: classProp,
  children,
  style,
  ...rest
}: ComposedBadgeProps) {
  return (
    <span class={cn(classes?.base, className ?? classProp)} style={style} {...rest}>
      {children}
    </span>
  );
}

export const ComposedBadge: ComposedPrimitive<BadgeClassKey, HTMLElement> =
  ComposedBadgeRoot as ComposedPrimitive<BadgeClassKey, HTMLElement>;
