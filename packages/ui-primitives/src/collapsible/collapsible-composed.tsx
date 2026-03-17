/**
 * Composed Collapsible — declarative JSX component with sub-components.
 * Follows WAI-ARIA disclosure pattern. Sub-components self-wire via context.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
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
  _registerTrigger: (children: ChildValue, cls?: string) => void;
  _registerContent: (children: ChildValue, cls?: string) => void;
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
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
// Sub-components
// ---------------------------------------------------------------------------

function CollapsibleTrigger({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useCollapsibleContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Collapsible.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerTrigger(children, effectiveCls);

  return (<span style="display: contents" />) as HTMLElement;
}

function CollapsibleContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useCollapsibleContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Collapsible.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(children, effectiveCls);

  return (<span style="display: contents" />) as HTMLElement;
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

  const reg: {
    triggerChildren: ChildValue;
    triggerCls: string | undefined;
    contentChildren: ChildValue;
    contentCls: string | undefined;
  } = {
    triggerChildren: undefined,
    triggerCls: undefined,
    contentChildren: undefined,
    contentCls: undefined,
  };

  const ctxValue: CollapsibleContextValue = {
    _registerTrigger: (triggerChildren, cls) => {
      reg.triggerChildren = triggerChildren;
      reg.triggerCls = cls;
    },
    _registerContent: (contentChildren, cls) => {
      reg.contentChildren = contentChildren;
      reg.contentCls = cls;
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Phase 1: resolve children to collect registrations
  CollapsibleContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // Resolve sub-component children
  const triggerNodes = resolveChildren(reg.triggerChildren);
  const contentNodes = resolveChildren(reg.contentChildren);

  // State
  let isOpen = defaultOpen;

  // Build content element
  const contentClass = [classes?.content, reg.contentCls].filter(Boolean).join(' ');
  const contentEl = (
    <div
      id={ids.contentId}
      data-part="collapsible-content"
      aria-hidden={isOpen ? 'false' : 'true'}
      data-state={isOpen ? 'open' : 'closed'}
      style={isOpen ? '' : 'display: none'}
      class={contentClass || undefined}
    >
      {...contentNodes}
    </div>
  ) as HTMLDivElement;

  // Build trigger element
  const triggerClass = [classes?.trigger, reg.triggerCls].filter(Boolean).join(' ');

  function toggle(): void {
    if (disabled) return;
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

  const triggerEl = (
    <button
      type="button"
      id={ids.triggerId}
      aria-controls={ids.contentId}
      aria-expanded={defaultOpen ? 'true' : 'false'}
      data-state={defaultOpen ? 'open' : 'closed'}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      class={triggerClass || undefined}
      onClick={toggle}
    >
      {...triggerNodes}
    </button>
  ) as HTMLButtonElement;

  // Build root
  const rootClass = classes?.root;
  return (
    <div data-part="collapsible" class={rootClass || undefined}>
      {triggerEl}
      {contentEl}
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
