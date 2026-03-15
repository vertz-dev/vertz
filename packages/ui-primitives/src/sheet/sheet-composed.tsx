/**
 * Composed Sheet — high-level composable component built on Sheet.Root.
 * Handles slot scanning, trigger wiring, ARIA sync, close buttons,
 * and class distribution via context.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import type { SheetSide } from './sheet';
import { Sheet } from './sheet';

// ---------------------------------------------------------------------------
// Class distribution context
// ---------------------------------------------------------------------------

export interface SheetClasses {
  overlay?: string;
  content?: string;
  title?: string;
  description?: string;
  close?: string;
}

const SheetClassesContext = createContext<SheetClasses | undefined>(
  undefined,
  '@vertz/ui-primitives::SheetClassesContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function SheetTrigger({ children }: SlotProps) {
  return (
    <span data-slot="sheet-trigger" style="display: contents">
      {children}
    </span>
  );
}

function SheetContent({ children, class: cls }: SlotProps) {
  return (
    <div data-slot="sheet-content" data-class={cls || undefined} style="display: contents">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function SheetTitle({ children, class: cls }: SlotProps) {
  const classes = useContext(SheetClassesContext);
  const combined = [classes?.title, cls].filter(Boolean).join(' ');
  return <h2 class={combined || undefined}>{children}</h2>;
}

function SheetDescription({ children, class: cls }: SlotProps) {
  const classes = useContext(SheetClassesContext);
  const combined = [classes?.description, cls].filter(Boolean).join(' ');
  return <p class={combined || undefined}>{children}</p>;
}

function SheetClose({ children, class: cls }: SlotProps) {
  const classes = useContext(SheetClassesContext);
  const combined = [classes?.close, cls].filter(Boolean).join(' ');
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
  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[] = [];
  SheetClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
  const triggerEntry = slots.get('sheet-trigger')?.[0];
  const contentEntry = slots.get('sheet-content')?.[0];

  // Extract user trigger element
  const userTrigger = triggerEntry
    ? ((triggerEntry.element.firstElementChild as HTMLElement) ?? triggerEntry.element)
    : null;

  // Create the low-level sheet primitive with ARIA sync
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

  // Apply overlay class
  if (classes?.overlay) {
    sheet.overlay.className = classes.overlay;
  }

  // Apply content class
  const contentInstanceClass = contentEntry?.attrs.class;
  const contentClassCombined = [classes?.content, contentInstanceClass].filter(Boolean).join(' ');
  if (contentClassCombined) {
    sheet.content.className = contentClassCombined;
  }

  // Wire the user's trigger
  if (userTrigger) {
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', sheet.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    userTrigger.addEventListener('click', () => {
      if (sheet.state.open.peek()) {
        sheet.hide();
      } else {
        sheet.show();
      }
    });
  }

  // Move content children into the sheet panel
  if (contentEntry) {
    for (const node of contentEntry.children) {
      sheet.content.appendChild(node);
    }
  }

  // Wire close buttons via event delegation
  sheet.content.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-slot="sheet-close"]');
    if (target) sheet.hide();
  });

  return (
    <div style="display: contents">
      {userTrigger}
      {sheet.overlay}
      {sheet.content}
    </div>
  ) as HTMLElement;
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
