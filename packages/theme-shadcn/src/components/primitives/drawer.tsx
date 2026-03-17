import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { SheetSide } from '@vertz/ui-primitives';
import { ComposedSheet } from '@vertz/ui-primitives';

export type DrawerSide = SheetSide;

interface DrawerStyleClasses {
  readonly overlay: string;
  readonly panelLeft: string;
  readonly panelRight: string;
  readonly panelTop: string;
  readonly panelBottom: string;
  readonly header: string;
  readonly title: string;
  readonly description: string;
  readonly footer: string;
  readonly handle: string;
  readonly close: string;
}

const PANEL_CLASS_MAP: Record<DrawerSide, keyof DrawerStyleClasses> = {
  left: 'panelLeft',
  right: 'panelRight',
  top: 'panelTop',
  bottom: 'panelBottom',
};

// ── Props ──────────────────────────────────────────────────

export interface DrawerRootProps {
  side?: DrawerSide;
  onOpenChange?: (open: boolean) => void;
  children?: ChildValue;
}

export interface DrawerSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedDrawerComponent {
  (props: DrawerRootProps): HTMLElement;
  Trigger: (props: DrawerSlotProps) => HTMLElement;
  Content: (props: DrawerSlotProps) => HTMLElement;
  Header: (props: DrawerSlotProps) => HTMLElement;
  Title: (props: DrawerSlotProps) => HTMLElement;
  Description: (props: DrawerSlotProps) => HTMLElement;
  Footer: (props: DrawerSlotProps) => HTMLElement;
  Handle: (props: DrawerSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedDrawer(styles: DrawerStyleClasses): ThemedDrawerComponent {
  function DrawerRoot({ children, side, onOpenChange }: DrawerRootProps): HTMLElement {
    const resolvedSide = side ?? 'bottom';
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

  function DrawerHeader({ children, className: cls, class: classProp }: DrawerSlotProps) {
    const effectiveCls = cls ?? classProp;
    const combined = [styles.header, effectiveCls].filter(Boolean).join(' ');
    const resolved = resolveChildren(children);
    // SAFETY: JSX returns Element (HTMLElement | SVGElement) but <div> is always HTMLElement
    return (
      <div data-slot="drawer-header" class={combined}>
        {...resolved}
      </div>
    ) as HTMLElement;
  }

  function DrawerFooter({ children, className: cls, class: classProp }: DrawerSlotProps) {
    const effectiveCls = cls ?? classProp;
    const combined = [styles.footer, effectiveCls].filter(Boolean).join(' ');
    const resolved = resolveChildren(children);
    // SAFETY: JSX returns Element (HTMLElement | SVGElement) but <div> is always HTMLElement
    return (
      <div data-slot="drawer-footer" class={combined}>
        {...resolved}
      </div>
    ) as HTMLElement;
  }

  function DrawerHandle({ className: cls, class: classProp }: DrawerSlotProps) {
    const effectiveCls = cls ?? classProp;
    const combined = [styles.handle, effectiveCls].filter(Boolean).join(' ');
    // SAFETY: JSX returns Element (HTMLElement | SVGElement) but <div> is always HTMLElement
    return (<div data-slot="drawer-handle" class={combined} />) as HTMLElement;
  }

  return Object.assign(DrawerRoot, {
    Trigger: ComposedSheet.Trigger,
    Content: ComposedSheet.Content,
    Header: DrawerHeader,
    Title: ComposedSheet.Title,
    Description: ComposedSheet.Description,
    Footer: DrawerFooter,
    Handle: DrawerHandle,
  });
}
