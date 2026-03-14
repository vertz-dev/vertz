/**
 * Composed AlertDialog — high-level composable component built on AlertDialog.Root.
 * Like Dialog composed, but blocks Escape/overlay dismiss and adds Cancel/Action slots.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { AlertDialog } from './alert-dialog';

// ---------------------------------------------------------------------------
// Class distribution context
// ---------------------------------------------------------------------------

export interface AlertDialogClasses {
  overlay?: string;
  content?: string;
  cancel?: string;
  action?: string;
  header?: string;
  title?: string;
  description?: string;
  footer?: string;
}

const AlertDialogClassesContext = createContext<AlertDialogClasses | undefined>(
  undefined,
  '@vertz/ui-primitives::AlertDialogClassesContext',
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

function AlertDialogTrigger({ children }: SlotProps): HTMLElement {
  const el = document.createElement('span');
  el.dataset.slot = 'alertdialog-trigger';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function AlertDialogContent({ children, class: cls }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'alertdialog-content';
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Sub-components — content elements (read classes from context)
// ---------------------------------------------------------------------------

function AlertDialogTitle({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(AlertDialogClassesContext);
  const el = document.createElement('h2');
  const combined = [classes?.title, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function AlertDialogDescription({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(AlertDialogClassesContext);
  const el = document.createElement('p');
  const combined = [classes?.description, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function AlertDialogHeader({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(AlertDialogClassesContext);
  const el = document.createElement('div');
  const combined = [classes?.header, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function AlertDialogFooter({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(AlertDialogClassesContext);
  const el = document.createElement('div');
  const combined = [classes?.footer, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function AlertDialogCancel({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(AlertDialogClassesContext);
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.slot = 'alertdialog-cancel';
  const combined = [classes?.cancel, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function AlertDialogAction({ children, class: cls }: SlotProps): HTMLElement {
  const classes = useContext(AlertDialogClassesContext);
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.slot = 'alertdialog-action';
  const combined = [classes?.action, cls].filter(Boolean).join(' ');
  if (combined) el.className = combined;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedAlertDialogProps {
  children?: ChildValue;
  classes?: AlertDialogClasses;
  onOpenChange?: (open: boolean) => void;
  onAction?: () => void;
}

// ---------------------------------------------------------------------------
// Class key type (for withStyles inference)
// ---------------------------------------------------------------------------

export type AlertDialogClassKey = keyof AlertDialogClasses;

function ComposedAlertDialogRoot({
  children,
  classes,
  onOpenChange,
  onAction,
}: ComposedAlertDialogProps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';

  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[];
  AlertDialogClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes!);
  const triggerEntry = slots.get('alertdialog-trigger')?.[0];
  const contentEntry = slots.get('alertdialog-content')?.[0];

  // Create the low-level alert dialog primitive
  const alertDialog = AlertDialog.Root({ onOpenChange, onAction });

  // Apply overlay class
  if (classes?.overlay) {
    alertDialog.overlay.className = classes.overlay;
  }

  // Apply content class (from classes prop + per-instance class)
  const contentInstanceClass = contentEntry?.attrs.class;
  const contentClassCombined = [classes?.content, contentInstanceClass].filter(Boolean).join(' ');
  if (contentClassCombined) {
    alertDialog.content.className = contentClassCombined;
  }

  // Wire the user's trigger
  if (triggerEntry) {
    const userTrigger =
      (triggerEntry.element.firstElementChild as HTMLElement) ?? triggerEntry.element;

    userTrigger.addEventListener('click', () => {
      if (!alertDialog.state.open.peek()) {
        alertDialog.show();
      }
    });

    wrapper.appendChild(userTrigger);
  }

  // Move content children into the alert dialog panel
  if (contentEntry) {
    for (const node of contentEntry.children) {
      alertDialog.content.appendChild(node);
    }
  }

  // Wire cancel buttons via event delegation
  alertDialog.content.addEventListener('click', (e) => {
    const cancelTarget = (e.target as HTMLElement).closest('[data-slot="alertdialog-cancel"]');
    if (cancelTarget) alertDialog.hide();

    const actionTarget = (e.target as HTMLElement).closest('[data-slot="alertdialog-action"]');
    if (actionTarget) {
      onAction?.();
      alertDialog.hide();
    }
  });

  // Portal overlay and content
  wrapper.appendChild(alertDialog.overlay);
  wrapper.appendChild(alertDialog.content);

  return wrapper;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedAlertDialog: ((props: ComposedAlertDialogProps) => HTMLElement) & {
  __classKeys?: AlertDialogClassKey;
  Trigger: typeof AlertDialogTrigger;
  Content: typeof AlertDialogContent;
  Title: typeof AlertDialogTitle;
  Description: typeof AlertDialogDescription;
  Header: typeof AlertDialogHeader;
  Footer: typeof AlertDialogFooter;
  Cancel: typeof AlertDialogCancel;
  Action: typeof AlertDialogAction;
} = Object.assign(ComposedAlertDialogRoot, {
  Trigger: AlertDialogTrigger,
  Content: AlertDialogContent,
  Title: AlertDialogTitle,
  Description: AlertDialogDescription,
  Header: AlertDialogHeader,
  Footer: AlertDialogFooter,
  Cancel: AlertDialogCancel,
  Action: AlertDialogAction,
});
