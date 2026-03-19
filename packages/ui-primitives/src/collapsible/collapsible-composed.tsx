/**
 * Composed Collapsible — compound component following WAI-ARIA disclosure pattern.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, useContext } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { linkedIds } from '../utils/id';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface CollapsibleClasses {
  root?: string;
  trigger?: string;
  content?: string;
}

export type CollapsibleClassKey = keyof CollapsibleClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CollapsibleContextValue {
  ids: { triggerId: string; contentId: string };
  triggerRef: Ref<HTMLButtonElement>;
  contentRef: Ref<HTMLDivElement>;
  classes?: CollapsibleClasses;
  disabled: boolean;
  /** Initial open state — read once at construction time, not reactive. */
  defaultOpen: boolean;
  toggle: () => void;
}

const CollapsibleContext = createContext<CollapsibleContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::CollapsibleContext',
);

function useCollapsibleContext(componentName: string): CollapsibleContextValue {
  const ctx = useContext(CollapsibleContext);
  if (!ctx) {
    throw new Error(
      `<Collapsible.${componentName}> must be used inside <Collapsible>. ` +
        'Ensure it is a direct or nested child of the Collapsible root component.',
    );
  }
  return ctx;
}

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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function CollapsibleTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useCollapsibleContext('Trigger');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.trigger, effectiveCls].filter(Boolean).join(' ');

  return (
    <button
      ref={ctx.triggerRef}
      type="button"
      id={ctx.ids.triggerId}
      aria-controls={ctx.ids.contentId}
      aria-expanded={ctx.defaultOpen ? 'true' : 'false'}
      data-state={ctx.defaultOpen ? 'open' : 'closed'}
      disabled={ctx.disabled}
      aria-disabled={ctx.disabled ? 'true' : undefined}
      class={combined || undefined}
      onClick={ctx.toggle}
    >
      {children}
    </button>
  );
}

function CollapsibleContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useCollapsibleContext('Content');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      ref={ctx.contentRef}
      id={ctx.ids.contentId}
      data-part="collapsible-content"
      aria-hidden={ctx.defaultOpen ? 'false' : 'true'}
      data-state={ctx.defaultOpen ? 'open' : 'closed'}
      style={ctx.defaultOpen ? '' : 'display: none'}
      class={combined || undefined}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedCollapsibleProps {
  children?: ChildValue;
  classes?: CollapsibleClasses;
  defaultOpen?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function ComposedCollapsibleRoot({
  children,
  classes,
  defaultOpen = false,
  disabled = false,
  onOpenChange,
}: ComposedCollapsibleProps) {
  const ids = linkedIds('collapsible');
  const triggerRef: Ref<HTMLButtonElement> = ref();
  const contentRef: Ref<HTMLDivElement> = ref();

  let isOpen = defaultOpen;

  function toggle(): void {
    if (disabled) return;
    const contentEl = contentRef.current;
    const triggerEl = triggerRef.current;
    if (!contentEl || !triggerEl) return;

    isOpen = !isOpen;

    if (isOpen) {
      setHidden(contentEl, false);
    }
    const height = contentEl.scrollHeight;
    contentEl.style.setProperty('--collapsible-content-height', `${height}px`);
    setExpanded(triggerEl, isOpen);
    setDataState(triggerEl, isOpen ? 'open' : 'closed');
    setDataState(contentEl, isOpen ? 'open' : 'closed');
    if (!isOpen) {
      setHiddenAnimated(contentEl, true);
    }
    onOpenChange?.(isOpen);
  }

  const ctx: CollapsibleContextValue = {
    ids,
    triggerRef,
    contentRef,
    classes,
    disabled,
    defaultOpen,
    toggle,
  };

  return (
    <div data-part="collapsible" class={classes?.root || undefined}>
      <CollapsibleContext.Provider value={ctx}>{children}</CollapsibleContext.Provider>
    </div>
  ) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedCollapsible = Object.assign(ComposedCollapsibleRoot, {
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent,
}) as ((props: ComposedCollapsibleProps) => HTMLElement) & {
  __classKeys?: CollapsibleClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
};
