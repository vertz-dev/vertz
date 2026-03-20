import type { ChildValue, CSSOutput } from '@vertz/ui';

type FormGroupBlocks = { base: string[]; error: string[] };

export interface FormGroupProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
}

export interface FormErrorProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
}

export interface FormGroupComponents {
  FormGroup: (props: FormGroupProps) => HTMLDivElement;
  FormError: (props: FormErrorProps) => HTMLSpanElement;
}

export function createFormGroupComponents(
  formGroupStyles: CSSOutput<FormGroupBlocks>,
): FormGroupComponents {
  function FormGroup({ className, class: classProp, children }: FormGroupProps) {
    const combinedClass = [formGroupStyles.base, className ?? classProp].filter(Boolean).join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  function FormError({ className, class: classProp, children }: FormErrorProps) {
    const combinedClass = [formGroupStyles.error, className ?? classProp].filter(Boolean).join(' ');
    return (<span class={combinedClass}>{children}</span>) as HTMLSpanElement;
  }

  return { FormGroup, FormError };
}
