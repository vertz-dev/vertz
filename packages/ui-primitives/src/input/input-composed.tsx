import { cn } from '../composed/cn';
import type { ComposedPrimitive } from '../composed/with-styles';

export interface InputClasses {
  base?: string;
}

export type InputClassKey = keyof InputClasses;

export interface ComposedInputProps {
  classes?: InputClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  name?: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  value?: string;
  [key: string]: unknown;
}

function ComposedInputRoot({ classes, className, class: classProp, ...props }: ComposedInputProps) {
  return <input class={cn(classes?.base, className ?? classProp)} {...props} />;
}

export const ComposedInput: ComposedPrimitive<InputClassKey, HTMLElement> =
  ComposedInputRoot as ComposedPrimitive<InputClassKey, HTMLElement>;
