import type { ChildValue } from '@vertz/ui';
import type { JSX } from '@vertz/ui/jsx-runtime';
import {
  StackDialogBody,
  StackDialogCancel,
  StackDialogClose,
  StackDialogDescription,
  StackDialogFooter,
  StackDialogHeader,
  StackDialogTitle,
} from '@vertz/ui-primitives';

// ── Props ──────────────────────────────────────────────────

export interface DialogSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedDialogComponent {
  Header: (props: DialogSlotProps) => JSX.Element;
  Title: (props: DialogSlotProps) => JSX.Element;
  Description: (props: DialogSlotProps) => JSX.Element;
  Footer: (props: DialogSlotProps) => JSX.Element;
  Body: (props: DialogSlotProps) => JSX.Element;
  Close: (props: DialogSlotProps) => JSX.Element;
  Cancel: (props: DialogSlotProps) => JSX.Element;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedDialog(): ThemedDialogComponent {
  return {
    Header: StackDialogHeader,
    Title: StackDialogTitle,
    Description: StackDialogDescription,
    Footer: StackDialogFooter,
    Body: StackDialogBody,
    Close: StackDialogClose,
    Cancel: StackDialogCancel,
  };
}
