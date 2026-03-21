/**
 * Stack-aware dialog sub-components.
 *
 * These components read from DialogHandleContext and DialogIdContext
 * provided by DialogStack in @vertz/ui. They are the building blocks
 * for dialogs opened via `dialogs.open()`.
 */

import type { ChildValue } from '@vertz/ui';
import { DialogHandleContext, DialogIdContext, useContext } from '@vertz/ui';
import type { JSX } from '@vertz/ui/jsx-runtime';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Shared props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

function useDialogId(): string {
  const id = useContext(DialogIdContext);
  if (!id) {
    throw new Error('Dialog sub-component must be used inside a dialog opened via DialogStack');
  }
  return id;
}

function useDialogHandle() {
  const handle = useContext(DialogHandleContext);
  if (!handle) {
    throw new Error('Dialog sub-component must be used inside a dialog opened via DialogStack');
  }
  return handle;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

export function StackDialogTitle({
  children,
  className: cls,
  class: classProp,
}: SlotProps): JSX.Element {
  const dialogId = useDialogId();
  return (
    <h2 id={`${dialogId}-title`} data-part="title" class={cn(cls ?? classProp)}>
      {children}
    </h2>
  );
}

export function StackDialogDescription({
  children,
  className: cls,
  class: classProp,
}: SlotProps): JSX.Element {
  const dialogId = useDialogId();
  return (
    <p id={`${dialogId}-desc`} data-part="description" class={cn(cls ?? classProp)}>
      {children}
    </p>
  );
}

export function StackDialogHeader({
  children,
  className: cls,
  class: classProp,
}: SlotProps): JSX.Element {
  return (
    <div data-part="header" class={cn(cls ?? classProp)}>
      {children}
    </div>
  );
}

export function StackDialogFooter({
  children,
  className: cls,
  class: classProp,
}: SlotProps): JSX.Element {
  return (
    <div data-part="footer" class={cn(cls ?? classProp)}>
      {children}
    </div>
  );
}

export function StackDialogBody({
  children,
  className: cls,
  class: classProp,
}: SlotProps): JSX.Element {
  return (
    <div data-part="body" class={cn(cls ?? classProp)}>
      {children}
    </div>
  );
}

export function StackDialogCancel({
  children,
  className: cls,
  class: classProp,
}: SlotProps): JSX.Element {
  const handle = useDialogHandle();
  return (
    <button
      type="button"
      data-part="cancel"
      class={cn(cls ?? classProp)}
      onClick={() => handle.close()}
    >
      {children}
    </button>
  );
}

export function StackDialogClose({
  children,
  className: cls,
  class: classProp,
}: SlotProps): JSX.Element {
  const handle = useDialogHandle();
  return (
    <button
      type="button"
      data-part="close"
      aria-label={children ? undefined : 'Close'}
      class={cn(cls ?? classProp)}
      onClick={() => handle.close()}
    >
      {children ?? '\u00D7'}
    </button>
  );
}
