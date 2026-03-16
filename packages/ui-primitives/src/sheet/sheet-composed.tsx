/**
 * Composed Sheet — high-level composable component built on Sheet.Root.
 * Sub-components self-wire via context. No slot scanning.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import type { SheetElements, SheetSide, SheetState } from './sheet';
import { Sheet } from './sheet';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface SheetClasses {
  overlay?: string;
  content?: string;
  title?: string;
  description?: string;
  close?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SheetContextValue {
  sheet: SheetElements & { state: SheetState };
  classes?: SheetClasses;
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
}

const SheetContext = createContext<SheetContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::SheetContext',
);

function useSheetContext(componentName: string): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) {
    throw new Error(
      `<Sheet.${componentName}> must be used inside <Sheet>. ` +
        'Ensure it is a direct or nested child of the Sheet root component.',
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

function SheetTrigger({ children }: SlotProps) {
  const { sheet, _registerTrigger } = useSheetContext('Trigger');

  // Resolve children to find the user's trigger element
  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;

  if (userTrigger) {
    // Wire ARIA attributes on the user's element
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', sheet.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    // Delegate click to sheet show/hide
    const handleClick = () => {
      if (sheet.state.open.peek()) {
        sheet.hide();
      } else {
        sheet.show();
      }
    };
    userTrigger.addEventListener('click', handleClick);
    _tryOnCleanup(() => userTrigger.removeEventListener('click', handleClick));

    // Register for ARIA sync on state changes
    _registerTrigger(userTrigger);
  }

  return <span style="display: contents">{...resolved}</span>;
}

function SheetContent({ children, className: cls, class: classProp }: SlotProps) {
  const { sheet, classes } = useSheetContext('Content');
  const effectiveCls = cls ?? classProp;

  // Apply theme + per-instance classes to the primitive's content element
  const combined = [classes?.content, effectiveCls].filter(Boolean).join(' ');
  if (combined) {
    sheet.content.className = combined;
  }

  // Apply overlay class
  if (classes?.overlay) {
    sheet.overlay.className = classes.overlay;
  }

  // Populate the primitive's content element with user children
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    sheet.content.appendChild(node);
  }

  // Wire close buttons via event delegation
  const handleContentClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest('[data-slot="sheet-close"]');
    if (target) sheet.hide();
  };
  sheet.content.addEventListener('click', handleContentClick);
  _tryOnCleanup(() => sheet.content.removeEventListener('click', handleContentClick));

  return sheet.content;
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function SheetTitle({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useSheetContext('Title');
  const combined = [classes?.title, effectiveCls].filter(Boolean).join(' ');
  return <h2 class={combined || undefined}>{children}</h2>;
}

function SheetDescription({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useSheetContext('Description');
  const combined = [classes?.description, effectiveCls].filter(Boolean).join(' ');
  return <p class={combined || undefined}>{children}</p>;
}

function SheetClose({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  const { classes } = useSheetContext('Close');
  const combined = [classes?.close, effectiveCls].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      data-slot="sheet-close"
      class={combined || undefined}
      aria-label={children ? undefined : 'Close'}
    >
      {children ?? '\u00D7'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedSheetProps {
  children?: ChildValue;
  classes?: SheetClasses;
  side?: SheetSide;
  onOpenChange?: (open: boolean) => void;
}

export type SheetClassKey = keyof SheetClasses;

function ComposedSheetRoot({ children, classes, side, onOpenChange }: ComposedSheetProps) {
  // Track the user's trigger element for ARIA sync
  let userTrigger: HTMLElement | null = null;

  // Create the low-level sheet primitive with ARIA sync on state changes
  const sheet = Sheet.Root({
    side,
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChange?.(isOpen);
    },
  });

  const ctxValue: SheetContextValue = {
    sheet,
    classes,
    _registerTrigger: (el: HTMLElement) => {
      userTrigger = el;
    },
  };

  // Provide primitive + classes via context, then resolve children
  let resolvedNodes: Node[] = [];
  SheetContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  return (
    <div style="display: contents">
      {...resolvedNodes}
      {sheet.overlay}
      {sheet.content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedSheet = Object.assign(ComposedSheetRoot, {
  Trigger: SheetTrigger,
  Content: SheetContent,
  Title: SheetTitle,
  Description: SheetDescription,
  Close: SheetClose,
}) as ((props: ComposedSheetProps) => HTMLElement) & {
  __classKeys?: SheetClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Title: (props: SlotProps) => HTMLElement;
  Description: (props: SlotProps) => HTMLElement;
  Close: (props: SlotProps) => HTMLElement;
};
