/**
 * Composed Popover — fully declarative JSX component with toggle, focus, and ARIA.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { createDismiss } from '../utils/dismiss';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { focusFirst, saveFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

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
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** @internal — registers content children and class */
  _registerContent: (children: ChildValue, cls?: string) => void;
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
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function PopoverTrigger({ children }: SlotProps) {
  const ctx = usePopoverContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Popover.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;

  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;
  if (userTrigger) {
    ctx._registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function PopoverContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = usePopoverContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Popover.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(children, effectiveCls);

  // Placeholder — Root renders the actual dialog element
  return (<span style="display: contents" />) as HTMLElement;
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

// Helper to build the context value — avoids compiler wrapping an object
// literal in computed(), which breaks the block-vs-object-literal ambiguity.
function buildPopoverCtx(
  registerTrigger: (el: HTMLElement) => void,
  registerContent: (children: ChildValue, cls?: string) => void,
): PopoverContextValue {
  return {
    _registerTrigger: registerTrigger,
    _registerContent: registerContent,
    _triggerClaimed: false,
    _contentClaimed: false,
  };
}

function ComposedPopoverRoot({
  children,
  classes,
  onOpenChange,
  positioning,
}: ComposedPopoverProps) {
  const ids = linkedIds('popover');

  // Registration storage — plain object so the compiler doesn't signal-transform it
  const reg: {
    triggerEl: HTMLElement | null;
    contentChildren: ChildValue;
    contentCls: string | undefined;
    floatingCleanup: (() => void) | null;
    dismissCleanup: (() => void) | null;
  } = {
    triggerEl: null,
    contentChildren: undefined,
    contentCls: undefined,
    floatingCleanup: null,
    dismissCleanup: null,
  };

  const ctxValue = buildPopoverCtx(
    (el) => {
      reg.triggerEl = el;
    },
    (contentChildren, cls) => {
      if (reg.contentChildren === undefined) {
        reg.contentChildren = contentChildren;
        reg.contentCls = cls;
      }
    },
  );

  // Phase 1: resolve children to collect registrations
  let resolvedNodes: Node[] = [];
  PopoverContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Phase 2: reactive state — compiler transforms `let` to signal
  let isOpen = false;
  const contentRef: Ref<HTMLDivElement> = ref();
  let restoreFocus: (() => void) | null = null;

  function open(): void {
    isOpen = true;
    if (reg.triggerEl) {
      reg.triggerEl.setAttribute('aria-expanded', 'true');
      reg.triggerEl.setAttribute('data-state', 'open');
    }
    restoreFocus = saveFocus();
    const contentEl = contentRef.current;
    if (contentEl) {
      if (positioning && reg.triggerEl) {
        const result = createFloatingPosition(reg.triggerEl, contentEl, positioning);
        reg.floatingCleanup = result.cleanup;
        reg.dismissCleanup = createDismiss({
          onDismiss: close,
          insideElements: [reg.triggerEl, contentEl],
          escapeKey: false,
        });
      }
      queueMicrotask(() => focusFirst(contentEl));
    }
    onOpenChange?.(true);
  }

  function close(): void {
    isOpen = false;
    if (reg.triggerEl) {
      reg.triggerEl.setAttribute('aria-expanded', 'false');
      reg.triggerEl.setAttribute('data-state', 'closed');
    }
    reg.floatingCleanup?.();
    reg.floatingCleanup = null;
    reg.dismissCleanup?.();
    reg.dismissCleanup = null;
    restoreFocus?.();
    restoreFocus = null;
    onOpenChange?.(false);
  }

  function toggle(): void {
    if (isOpen) close();
    else open();
  }

  // Wire user trigger with ARIA attributes and click handler
  if (reg.triggerEl) {
    reg.triggerEl.setAttribute('aria-haspopup', 'dialog');
    reg.triggerEl.setAttribute('aria-controls', ids.contentId);
    reg.triggerEl.setAttribute('aria-expanded', 'false');
    reg.triggerEl.setAttribute('data-state', 'closed');

    const triggerEl = reg.triggerEl;
    const handleClick = () => toggle();
    triggerEl.addEventListener('click', handleClick);
    _tryOnCleanup(() => triggerEl.removeEventListener('click', handleClick));
  }

  // Resolve content children
  const contentNodes = resolveChildren(reg.contentChildren);
  const combined = [classes?.content, reg.contentCls].filter(Boolean).join(' ');

  return (
    <div style="display: contents">
      {...resolvedNodes}
      <div
        ref={contentRef}
        role="dialog"
        id={ids.contentId}
        aria-hidden={isOpen ? 'false' : 'true'}
        data-state={isOpen ? 'open' : 'closed'}
        style={isOpen ? '' : 'display: none'}
        class={combined || undefined}
        onKeydown={(event: KeyboardEvent) => {
          if (isKey(event, Keys.Escape)) {
            event.preventDefault();
            close();
          }
        }}
      >
        {...contentNodes}
      </div>
    </div>
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
