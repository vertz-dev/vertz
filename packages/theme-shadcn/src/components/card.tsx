import type { ChildValue, CSSOutput } from '@vertz/ui';

type CardBlocks = {
  root: string[];
  header: string[];
  title: string[];
  description: string[];
  content: string[];
  footer: string[];
  action: string[];
};

export interface CardProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
}

export interface CardComponents {
  Card: (props: CardProps) => HTMLDivElement;
  CardHeader: (props: CardProps) => HTMLDivElement;
  CardTitle: (props: CardProps) => HTMLHeadingElement;
  CardDescription: (props: CardProps) => HTMLParagraphElement;
  CardContent: (props: CardProps) => HTMLDivElement;
  CardFooter: (props: CardProps) => HTMLDivElement;
  CardAction: (props: CardProps) => HTMLDivElement;
}

export function createCardComponents(cardStyles: CSSOutput<CardBlocks>): CardComponents {
  function Card({ className, class: classProp, children }: CardProps) {
    const combinedClass = [cardStyles.root, className ?? classProp].filter(Boolean).join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  function CardHeader({ className, class: classProp, children }: CardProps) {
    const combinedClass = [cardStyles.header, className ?? classProp].filter(Boolean).join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  function CardTitle({ className, class: classProp, children }: CardProps) {
    const combinedClass = [cardStyles.title, className ?? classProp].filter(Boolean).join(' ');
    return (<h3 class={combinedClass}>{children}</h3>) as HTMLHeadingElement;
  }

  function CardDescription({ className, class: classProp, children }: CardProps) {
    const combinedClass = [cardStyles.description, className ?? classProp]
      .filter(Boolean)
      .join(' ');
    return (<p class={combinedClass}>{children}</p>) as HTMLParagraphElement;
  }

  function CardContent({ className, class: classProp, children }: CardProps) {
    const combinedClass = [cardStyles.content, className ?? classProp].filter(Boolean).join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  function CardFooter({ className, class: classProp, children }: CardProps) {
    const combinedClass = [cardStyles.footer, className ?? classProp].filter(Boolean).join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  function CardAction({ className, class: classProp, children }: CardProps) {
    const combinedClass = [cardStyles.action, className ?? classProp].filter(Boolean).join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  return {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
    CardAction,
  };
}
