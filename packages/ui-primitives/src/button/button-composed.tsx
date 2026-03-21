import type { ChildValue } from '@vertz/ui';
import { cn } from '../composed/cn';
import type { ComposedPrimitive } from '../composed/with-styles';

export interface ButtonClasses {
  base?: string;
}

export type ButtonClassKey = keyof ButtonClasses;

export interface ComposedButtonProps {
  classes?: ButtonClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  [key: string]: unknown;
}

function ComposedButtonRoot({
  classes,
  className,
  class: classProp,
  children,
  disabled,
  type,
  ...rest
}: ComposedButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      class={cn(classes?.base, className ?? classProp)}
      disabled={disabled || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export const ComposedButton: ComposedPrimitive<ButtonClassKey, HTMLElement> =
  ComposedButtonRoot as ComposedPrimitive<ButtonClassKey, HTMLElement>;
