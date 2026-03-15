import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

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
  function FormGroup({ className, class: classProp, children }: FormGroupProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [formGroupStyles.base, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function FormError({ className, class: classProp, children }: FormErrorProps): HTMLSpanElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('span');
    el.className = [formGroupStyles.error, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  return {
    FormGroup: FormGroup,
    FormError: FormError,
  };
}
