import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type AlertBlocks = {
  root: string[];
  destructive: string[];
  title: string[];
  description: string[];
};

export interface AlertProps {
  variant?: 'default' | 'destructive';
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
}

export interface AlertComponents {
  Alert: (props: AlertProps) => HTMLDivElement;
  AlertTitle: (props: AlertProps) => HTMLHeadingElement;
  AlertDescription: (props: AlertProps) => HTMLDivElement;
}

export function createAlertComponents(alertStyles: CSSOutput<AlertBlocks>): AlertComponents {
  function Alert({ variant, className, class: classProp, children }: AlertProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    const classes = [alertStyles.root];
    if (variant === 'destructive') {
      classes.push(alertStyles.destructive);
    }
    if (effectiveClass) {
      classes.push(effectiveClass);
    }
    el.className = classes.join(' ');
    el.setAttribute('role', 'alert');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AlertTitle({ className, class: classProp, children }: AlertProps): HTMLHeadingElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('h5');
    el.className = [alertStyles.title, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AlertDescription({ className, class: classProp, children }: AlertProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [alertStyles.description, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  return { Alert, AlertTitle, AlertDescription };
}
