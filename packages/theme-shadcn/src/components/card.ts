import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

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
  function Card({ className, class: classProp, children }: CardProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [cardStyles.root, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardHeader({ className, class: classProp, children }: CardProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [cardStyles.header, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardTitle({ className, class: classProp, children }: CardProps): HTMLHeadingElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('h3');
    el.className = [cardStyles.title, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardDescription({
    className,
    class: classProp,
    children,
  }: CardProps): HTMLParagraphElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('p');
    el.className = [cardStyles.description, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardContent({ className, class: classProp, children }: CardProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [cardStyles.content, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardFooter({ className, class: classProp, children }: CardProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [cardStyles.footer, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardAction({ className, class: classProp, children }: CardProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [cardStyles.action, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
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
