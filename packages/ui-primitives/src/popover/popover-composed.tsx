/**
 * Composed Popover — compound component with floating content.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';
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
  isOpen: () => boolean;
  contentId: string;
  contentRef: Ref<HTMLDivElement>;
  classes?: PopoverClasses;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** @internal Per-Root content instance counter for duplicate detection. */
  _contentCount: { value: number };
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
      style={{ display: 'contents' }}
      data-popover-trigger=""
      aria-haspopup="dialog"
      aria-controls={ctx.contentId}
      aria-expanded="false"
      data-state="closed"
      onClick={() => {
        ctx.toggle();
        const nowOpen = ctx.isOpen();
        const el = document.querySelector(
          `[data-popover-trigger][aria-controls="${ctx.contentId}"]`,
        );
        if (el) {
          el.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
          el.setAttribute('data-state', nowOpen ? 'open' : 'closed');
        }
      }}
    >
      {children}
    </span>
  );
}

function PopoverContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = usePopoverContext('Content');

  // Track content instances per Root for duplicate detection.
  const instanceIndex = ctx._contentCount.value++;
  if (instanceIndex > 0) {
    console.warn('Duplicate <Popover.Content> detected \u2013 only the first is used');
  }

  return (
    <div
      ref={ctx.contentRef}
      role="dialog"
      id={ctx.contentId}
      data-popover-content=""
      aria-hidden="true"
      data-state="closed"
      style={{ display: 'none' }}
      class={cn(ctx.classes?.content, cls ?? classProp)}
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
  const contentRef: Ref<HTMLDivElement> = ref();

  let isOpen = false;

  // Track cleanup functions for floating position and dismiss listeners.
  // Plain object so the compiler doesn't signal-transform it.
  const cleanup: { floating: (() => void) | null; dismiss: (() => void) | null } = {
    floating: null,
    dismiss: null,
  };

  function getElements(): { trigger: HTMLElement | null; content: HTMLElement | null } {
    const content = contentRef.current ?? null;
    let trigger = content
      ? (content.parentElement?.querySelector('[data-popover-trigger]') as HTMLElement | null)
      : null;
    // The trigger wrapper uses display:contents (no box / zero rect).
    // Walk down to the first descendant with actual layout for positioning.
    while (trigger && getComputedStyle(trigger).display === 'contents') {
      trigger = trigger.firstElementChild as HTMLElement | null;
    }
    return { trigger, content };
  }

  function syncContentAttrs(nowOpen: boolean): void {
    const content = contentRef.current;
    if (!content) return;
    content.setAttribute('data-state', nowOpen ? 'open' : 'closed');
    content.setAttribute('aria-hidden', nowOpen ? 'false' : 'true');
    content.style.display = nowOpen ? '' : 'none';
  }

  function open(): void {
    isOpen = true;
    syncContentAttrs(true);

    const { trigger, content } = getElements();
    if (trigger && content) {
      // Always set up floating positioning (with sensible defaults).
      content.style.position = 'fixed';
      const floatingOpts = positioning ?? {};
      const result = createFloatingPosition(trigger, content, floatingOpts);
      cleanup.floating = result.cleanup;

      // Always set up dismiss (click-outside + Escape).
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
    syncContentAttrs(false);

    // Reset floating position styles
    const content = contentRef.current;
    if (content) {
      content.style.position = '';
      content.style.left = '';
      content.style.top = '';
    }

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
    isOpen: () => isOpen,
    contentId: ids.contentId,
    contentRef,
    classes,
    open,
    close,
    toggle,
    _contentCount: { value: 0 },
  };

  return (
    <PopoverContext.Provider value={ctx}>
      <span style={{ display: 'contents' }} data-popover-root="">
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
