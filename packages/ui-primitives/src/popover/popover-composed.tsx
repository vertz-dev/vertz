/**
 * Composed Popover — high-level composable component built on Popover.Root.
 * Sub-components self-wire via context. No slot scanning.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import type { FloatingOptions } from '../utils/floating';
import type { PopoverElements, PopoverState } from './popover';
import { Popover } from './popover';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface PopoverClasses {
  content?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PopoverContextValue {
  popover: PopoverElements & { state: PopoverState };
  classes?: PopoverClasses;
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const PopoverContext = createContext<PopoverContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::PopoverContext',
);

function usePopoverContext(componentName: string): PopoverContextValue {
  const ctx = useContext(PopoverContext);
  if (!ctx) {
    throw new Error(
      `<Popover.${componentName}> must be used inside <Popover>. ` +
        'Ensure it is a direct or nested child of the Popover root component.',
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
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function PopoverTrigger({ children }: SlotProps) {
  const ctx = usePopoverContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Popover.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;
  const { popover, _registerTrigger } = ctx;

  // Resolve children to find the user's trigger element
  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;

  if (userTrigger) {
    // Wire ARIA attributes on the user's element
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', popover.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    // Delegate click to the primitive's trigger
    const handleClick = () => {
      popover.trigger.click();
    };
    userTrigger.addEventListener('click', handleClick);
    _tryOnCleanup(() => userTrigger.removeEventListener('click', handleClick));

    // Register for ARIA sync on state changes
    _registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function PopoverContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = usePopoverContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Popover.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;
  const { popover, classes } = ctx;
  const effectiveCls = cls ?? classProp;

  // Apply theme + per-instance classes to the primitive's content element
  const combined = [classes?.content, effectiveCls].filter(Boolean).join(' ');
  if (combined) {
    popover.content.className = combined;
  }

  // Populate the primitive's content element with user children
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    popover.content.appendChild(node);
  }

  return popover.content;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedPopoverProps {
  children?: ChildValue;
  classes?: PopoverClasses;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
}

export type PopoverClassKey = keyof PopoverClasses;

function ComposedPopoverRoot({
  children,
  classes,
  onOpenChange,
  positioning,
}: ComposedPopoverProps) {
  // Track the user's trigger element for ARIA sync
  let userTrigger: HTMLElement | null = null;

  // Create the low-level popover primitive with ARIA sync on state changes
  const popover = Popover.Root({
    positioning,
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChange?.(isOpen);
    },
  });

  const ctxValue: PopoverContextValue = {
    popover,
    classes,
    _registerTrigger: (el: HTMLElement) => {
      userTrigger = el;
    },
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Provide primitive + classes via context, then resolve children
  // Sub-components (Trigger, Content) read context and self-wire
  let resolvedNodes: Node[] = [];
  PopoverContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  return <div style="display: contents">{...resolvedNodes}</div>;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedPopover = Object.assign(ComposedPopoverRoot, {
  Trigger: PopoverTrigger,
  Content: PopoverContent,
}) as ((props: ComposedPopoverProps) => HTMLElement) & {
  __classKeys?: PopoverClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
};
