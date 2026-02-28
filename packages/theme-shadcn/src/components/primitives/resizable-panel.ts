import type {
  PanelOptions,
  ResizablePanelElements,
  ResizablePanelOptions,
  ResizablePanelState,
} from '@vertz/ui-primitives';
import { ResizablePanel } from '@vertz/ui-primitives';

interface ResizablePanelStyleClasses {
  readonly root: string;
  readonly panel: string;
  readonly handle: string;
}

export function createThemedResizablePanel(styles: ResizablePanelStyleClasses): (
  options?: ResizablePanelOptions,
) => ResizablePanelElements & {
  state: ResizablePanelState;
  Panel: (panelOptions?: PanelOptions) => HTMLDivElement;
  Handle: () => HTMLDivElement;
} {
  return function themedResizablePanel(options?: ResizablePanelOptions) {
    const result = ResizablePanel.Root(options);
    result.root.classList.add(styles.root);
    const originalPanel = result.Panel;
    const originalHandle = result.Handle;

    return {
      root: result.root,
      state: result.state,
      Panel: (panelOptions?: PanelOptions) => {
        const panel = originalPanel(panelOptions);
        panel.classList.add(styles.panel);
        return panel;
      },
      Handle: () => {
        const handle = originalHandle();
        handle.classList.add(styles.handle);
        return handle;
      },
    };
  };
}
