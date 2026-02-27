import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type CardBlocks = {
  root: string[];
  header: string[];
  title: string[];
  description: string[];
  content: string[];
  footer: string[];
};

export interface CardProps {
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
}

export function createCardComponents(cardStyles: CSSOutput<CardBlocks>): CardComponents {
  function Card({ class: className, children }: CardProps): HTMLDivElement {
    const el = document.createElement('div');
    el.className = [cardStyles.root, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardHeader({ class: className, children }: CardProps): HTMLDivElement {
    const el = document.createElement('div');
    el.className = [cardStyles.header, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardTitle({ class: className, children }: CardProps): HTMLHeadingElement {
    const el = document.createElement('h3');
    el.className = [cardStyles.title, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardDescription({ class: className, children }: CardProps): HTMLParagraphElement {
    const el = document.createElement('p');
    el.className = [cardStyles.description, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardContent({ class: className, children }: CardProps): HTMLDivElement {
    const el = document.createElement('div');
    el.className = [cardStyles.content, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function CardFooter({ class: className, children }: CardProps): HTMLDivElement {
    const el = document.createElement('div');
    el.className = [cardStyles.footer, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  return {
    Card: Card,
    CardHeader: CardHeader,
    CardTitle: CardTitle,
    CardDescription: CardDescription,
    CardContent: CardContent,
    CardFooter: CardFooter,
  };
}
