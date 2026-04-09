import type { ChildValue } from '@vertz/ui';
import { ComposedAccordion, withStyles } from '@vertz/ui-primitives';

interface AccordionStyleClasses {
  readonly item: string;
  readonly trigger: string;
  readonly content: string;
}

// ── Props ──────────────────────────────────────────────────

export interface AccordionRootProps {
  type?: 'single' | 'multiple';
  defaultValue?: string[];
  children?: ChildValue;
}

export interface AccordionSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface AccordionItemProps {
  value: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedAccordionComponent {
  (props: AccordionRootProps): HTMLElement;
  Item: (props: AccordionItemProps) => HTMLElement;
  Trigger: (props: AccordionSlotProps) => HTMLElement;
  Content: (props: AccordionSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedAccordion(styles: AccordionStyleClasses): ThemedAccordionComponent {
  const StyledAccordion = withStyles(ComposedAccordion, {
    item: styles.item,
    trigger: styles.trigger,
    content: styles.content,
  });

  function AccordionRoot({ type, defaultValue, children }: AccordionRootProps) {
    return (
      <StyledAccordion type={type} defaultValue={defaultValue}>
        {children}
      </StyledAccordion>
    );
  }

  return Object.assign(AccordionRoot, {
    Item: ComposedAccordion.Item,
    Trigger: ComposedAccordion.Trigger,
    Content: ComposedAccordion.Content,
  });
}
