import type { ChildValue } from '@vertz/ui';
import type { PanelOptions } from '@vertz/ui-primitives';
import { ComposedResizablePanel } from '@vertz/ui-primitives';

interface ResizablePanelStyleClasses {
  readonly root: string;
  readonly panel: string;
  readonly handle: string;
}

// ── Props ──────────────────────────────────────────────────

export interface ResizablePanelRootProps {
  orientation?: 'horizontal' | 'vertical';
  onResize?: (sizes: number[]) => void;
  children?: ChildValue;
}

export interface ResizablePanelPanelProps extends PanelOptions {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface ResizablePanelHandleProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedResizablePanelComponent {
  (props: ResizablePanelRootProps): HTMLElement;
  Panel: (props: ResizablePanelPanelProps) => HTMLElement;
  Handle: (props: ResizablePanelHandleProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedResizablePanel(
  styles: ResizablePanelStyleClasses,
): ThemedResizablePanelComponent {
  function ResizablePanelRoot({
    children,
    orientation,
    onResize,
  }: ResizablePanelRootProps): HTMLElement {
    return ComposedResizablePanel({
      children,
      orientation,
      onResize,
      classes: {
        root: styles.root,
        panel: styles.panel,
        handle: styles.handle,
      },
    });
  }

  return Object.assign(ResizablePanelRoot, {
    Panel: ComposedResizablePanel.Panel,
    Handle: ComposedResizablePanel.Handle,
  });
}
