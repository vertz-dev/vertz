import type { ChildValue } from '@vertz/ui';
import type { SheetSide } from '@vertz/ui-primitives';
import { ComposedSheet } from '@vertz/ui-primitives';

export type { SheetSide };

interface SheetStyleClasses {
  readonly overlay: string;
  readonly panelLeft: string;
  readonly panelRight: string;
  readonly panelTop: string;
  readonly panelBottom: string;
  readonly title: string;
  readonly description: string;
  readonly close: string;
}

const PANEL_CLASS_MAP: Record<SheetSide, keyof SheetStyleClasses> = {
  left: 'panelLeft',
  right: 'panelRight',
  top: 'panelTop',
  bottom: 'panelBottom',
};

// ── Props ──────────────────────────────────────────────────

export interface SheetRootProps {
  side?: SheetSide;
  onOpenChange?: (open: boolean) => void;
  children?: ChildValue;
}

export interface SheetSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedSheetComponent {
  (props: SheetRootProps): HTMLElement;
  Trigger: (props: SheetSlotProps) => HTMLElement;
  Content: (props: SheetSlotProps) => HTMLElement;
  Title: (props: SheetSlotProps) => HTMLElement;
  Description: (props: SheetSlotProps) => HTMLElement;
  Close: (props: SheetSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedSheet(styles: SheetStyleClasses): ThemedSheetComponent {
  function SheetRoot({ children, side, onOpenChange }: SheetRootProps): HTMLElement {
    const resolvedSide = side ?? 'right';
    const panelClass = styles[PANEL_CLASS_MAP[resolvedSide]];

    return ComposedSheet({
      children,
      side: resolvedSide,
      onOpenChange,
      classes: {
        overlay: styles.overlay,
        content: panelClass,
        title: styles.title,
        description: styles.description,
        close: styles.close,
      },
    });
  }

  return Object.assign(SheetRoot, {
    Trigger: ComposedSheet.Trigger,
    Content: ComposedSheet.Content,
    Title: ComposedSheet.Title,
    Description: ComposedSheet.Description,
    Close: ComposedSheet.Close,
  });
}
