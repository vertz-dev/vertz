import type { ChildValue, CSSOutput } from '@vertz/ui';

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
  function Alert({ variant, className, class: classProp, children }: AlertProps) {
    const classes = [alertStyles.root];
    if (variant === 'destructive') {
      classes.push(alertStyles.destructive);
    }
    const effectiveClass = className ?? classProp;
    if (effectiveClass) {
      classes.push(effectiveClass);
    }
    const combinedClass = classes.join(' ');
    return (
      <div class={combinedClass} role="alert">
        {children}
      </div>
    ) as HTMLDivElement;
  }

  function AlertTitle({ className, class: classProp, children }: AlertProps) {
    const combinedClass = [alertStyles.title, className ?? classProp].filter(Boolean).join(' ');
    return (<h5 class={combinedClass}>{children}</h5>) as HTMLHeadingElement;
  }

  function AlertDescription({ className, class: classProp, children }: AlertProps) {
    const combinedClass = [alertStyles.description, className ?? classProp]
      .filter(Boolean)
      .join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  return { Alert, AlertTitle, AlertDescription };
}
