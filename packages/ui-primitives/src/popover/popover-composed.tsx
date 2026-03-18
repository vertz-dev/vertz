/**
 * Composed Popover — compound component with floating content.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, onMount, useContext } from '@vertz/ui';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { linkedIds } from '../utils/id';

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
  isOpen: boolean;
  contentId: string;
  classes?: PopoverClasses;
  open: () => void;
  close: () => void;
  toggle: () => void;
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function PopoverTrigger({ children }: SlotProps) {
  const ctx = usePopoverContext('Trigger');
  return (
    <span
      style="display: contents"
      data-popover-trigger=""
      data-state={ctx.isOpen ? 'open' : 'closed'}
      onClick={() => ctx.toggle()}
    >
      {children}
    </span>
  );
}

function PopoverContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = usePopoverContext('Content');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.content, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="dialog"
      id={ctx.contentId}
      data-popover-content=""
      aria-hidden={ctx.isOpen ? 'false' : 'true'}
      data-state={ctx.isOpen ? 'open' : 'closed'}
      style={ctx.isOpen ? '' : 'display: none'}
      class={combined || undefined}
    >
      {children}
    </div>
  );
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
  const ids = linkedIds('popover');

  let isOpen = false;

  // Track cleanup functions for floating position and dismiss listeners.
  // Plain object so the compiler doesn't signal-transform it.
  const cleanup: { floating: (() => void) | null; dismiss: (() => void) | null } = {
    floating: null,
    dismiss: null,
  };

  function getElements(): { trigger: HTMLElement | null; content: HTMLElement | null } {
    const content = document.getElementById(ids.contentId);
    const trigger = content
      ? (content.parentElement?.querySelector('[data-popover-trigger]') as HTMLElement | null)
      : null;
    return { trigger, content };
  }

  function open(): void {
    isOpen = true;

    const { trigger, content } = getElements();
    if (trigger && content && positioning) {
      const result = createFloatingPosition(trigger, content, positioning);
      cleanup.floating = result.cleanup;
      cleanup.dismiss = createDismiss({
        onDismiss: close,
        insideElements: [trigger, content],
        escapeKey: true,
      });
    }

    onOpenChange?.(true);
  }

  function close(): void {
    isOpen = false;
    cleanup.floating?.();
    cleanup.floating = null;
    cleanup.dismiss?.();
    cleanup.dismiss = null;
    onOpenChange?.(false);
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  const ctx: PopoverContextValue = {
    isOpen,
    contentId: ids.contentId,
    classes,
    open,
    close,
    toggle,
  };

  return (
    <PopoverContext.Provider value={ctx}>
      <span style="display: contents" data-popover-root="">
        {children}
      </span>
    </PopoverContext.Provider>
  );
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
