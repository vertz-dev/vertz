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

export interface SheetContentProps extends SheetSlotProps {
  showClose?: boolean;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedSheetComponent {
  (props: SheetRootProps): HTMLElement;
  Trigger: (props: SheetSlotProps) => HTMLElement;
  Content: (props: SheetContentProps) => HTMLElement;
  Title: (props: SheetSlotProps) => HTMLElement;
  Description: (props: SheetSlotProps) => HTMLElement;
  Close: (props: SheetSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedSheet(styles: SheetStyleClasses): ThemedSheetComponent {
  function SheetRoot({ children, side, onOpenChange }: SheetRootProps): HTMLElement {
    const resolvedSide = side ?? 'right';
    const panelClass = styles[PANEL_CLASS_MAP[resolvedSide]];

    return (
      <ComposedSheet
        side={resolvedSide}
        onOpenChange={onOpenChange}
        classes={{
          overlay: styles.overlay,
          content: panelClass,
          title: styles.title,
          description: styles.description,
          close: styles.close,
        }}
      >
        {children}
      </ComposedSheet>
    ) as HTMLElement;
  }

  return Object.assign(SheetRoot, {
    Trigger: ComposedSheet.Trigger,
    Content: ComposedSheet.Content,
    Title: ComposedSheet.Title,
    Description: ComposedSheet.Description,
    Close: ComposedSheet.Close,
  });
}
