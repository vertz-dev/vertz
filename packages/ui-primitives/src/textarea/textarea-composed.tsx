import { cn } from '../composed/cn';
import type { ComposedPrimitive } from '../composed/with-styles';

export interface TextareaClasses {
  base?: string;
}

export type TextareaClassKey = keyof TextareaClasses;

export interface ComposedTextareaProps {
  classes?: TextareaClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  value?: string;
  rows?: number;
  [key: string]: unknown;
}

function ComposedTextareaRoot({
  classes,
  className,
  class: classProp,
  value,
  ...props
}: ComposedTextareaProps) {
  const el = <textarea class={cn(classes?.base, className ?? classProp)} {...props} />;
  if (value !== undefined) (el as HTMLTextAreaElement).value = value;
  return el;
}

export const ComposedTextarea: ComposedPrimitive<TextareaClassKey, HTMLElement> =
  ComposedTextareaRoot as ComposedPrimitive<TextareaClassKey, HTMLElement>;
