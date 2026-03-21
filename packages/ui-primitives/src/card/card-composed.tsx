/**
 * Composed Card — compound component with context-based class distribution.
 * Sub-components: Header, Title, Description, Content, Footer, Action.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface CardClasses {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  content?: string;
  footer?: string;
  action?: string;
}

export type CardClassKey = keyof CardClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CardContext = createContext<{ classes?: CardClasses } | undefined>(
  undefined,
  '@vertz/ui-primitives::CardContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CardHeader({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  return <div class={cn(ctx?.classes?.header, className ?? classProp)}>{children}</div>;
}

function CardTitle({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  return <h3 class={cn(ctx?.classes?.title, className ?? classProp)}>{children}</h3>;
}

function CardDescription({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  return <p class={cn(ctx?.classes?.description, className ?? classProp)}>{children}</p>;
}

function CardContent({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  return <div class={cn(ctx?.classes?.content, className ?? classProp)}>{children}</div>;
}

function CardFooter({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  return <div class={cn(ctx?.classes?.footer, className ?? classProp)}>{children}</div>;
}

function CardAction({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  return <div class={cn(ctx?.classes?.action, className ?? classProp)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedCardProps {
  children?: ChildValue;
  classes?: CardClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

function ComposedCardRoot({ children, classes, className, class: classProp }: ComposedCardProps) {
  return (
    <CardContext.Provider value={{ classes }}>
      <div class={cn(classes?.root, className ?? classProp)}>{children}</div>
    </CardContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedCard = Object.assign(ComposedCardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
  Action: CardAction,
}) as ((props: ComposedCardProps) => HTMLElement) & {
  __classKeys?: CardClassKey;
  Header: (props: SlotProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Footer: (props: SlotProps) => HTMLElement;
  Action: (props: SlotProps) => HTMLElement;
};
