import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type FormGroupBlocks = { base: string[]; error: string[] };

export interface FormGroupProps {
  class?: string;
  children?: ChildValue;
}

export interface FormErrorProps {
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
  function FormGroup({ class: className, children }: FormGroupProps): HTMLDivElement {
    const el = document.createElement('div');
    el.className = [formGroupStyles.base, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function FormError({ class: className, children }: FormErrorProps): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = [formGroupStyles.error, className].filter(Boolean).join(' ');
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
