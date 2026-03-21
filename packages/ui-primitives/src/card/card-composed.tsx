/**
 * Composed Card — compound component with context-based class distribution.
 * Sub-components: Header, Title, Description, Content, Footer, Action.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';

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
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.header, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function CardTitle({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.title, effectiveCls].filter(Boolean).join(' ');
  return <h3 class={combined || undefined}>{children}</h3>;
}

function CardDescription({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.description, effectiveCls].filter(Boolean).join(' ');
  return <p class={combined || undefined}>{children}</p>;
}

function CardContent({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.content, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function CardFooter({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.footer, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
}

function CardAction({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.action, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
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
  const effectiveCls = className ?? classProp;
  const combinedClass = [classes?.root, effectiveCls].filter(Boolean).join(' ');
  return (
    <CardContext.Provider value={{ classes }}>
      <div class={combinedClass || undefined}>{children}</div>
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
