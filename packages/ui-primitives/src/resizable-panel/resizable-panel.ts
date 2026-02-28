/**
 * ResizablePanel primitive - resizable split panels with keyboard and pointer support.
 * Follows WAI-ARIA separator pattern.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setValueRange } from '../utils/aria';
import { isKey, Keys } from '../utils/keyboard';

export interface ResizablePanelOptions {
  orientation?: 'horizontal' | 'vertical';
  onResize?: (sizes: number[]) => void;
}

export interface PanelOptions {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

export interface ResizablePanelState {
  sizes: Signal<number[]>;
}

export interface ResizablePanelElements {
  root: HTMLDivElement;
}

export const ResizablePanel = {
  Root(options: ResizablePanelOptions = {}): ResizablePanelElements & {
    state: ResizablePanelState;
    Panel: (panelOptions?: PanelOptions) => HTMLDivElement;
    Handle: () => HTMLDivElement;
  } {
    const { orientation = 'horizontal', onResize } = options;
    const state: ResizablePanelState = { sizes: signal<number[]>([]) };
    const panels: { el: HTMLDivElement; minSize: number; maxSize: number }[] = [];
    const handles: HTMLDivElement[] = [];

    const root = document.createElement('div');
    root.style.display = 'flex';
    root.style.flexDirection = orientation === 'horizontal' ? 'row' : 'column';
    root.setAttribute('data-orientation', orientation);

    function updateSizes(newSizes: number[]): void {
      state.sizes.value = [...newSizes];
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        if (!panel) continue;
        const size = newSizes[i] ?? 0;
        panel.el.style.flex = `0 0 ${size}%`;
      }
      for (let i = 0; i < handles.length; i++) {
        const handle = handles[i];
        const leftPanel = panels[i];
        if (handle && leftPanel) {
          const size = newSizes[i] ?? 0;
          setValueRange(
            handle,
            Math.round(size),
            Math.round(leftPanel.minSize),
            Math.round(leftPanel.maxSize),
          );
        }
      }
      onResize?.(newSizes);
    }

    function Panel(panelOptions: PanelOptions = {}): HTMLDivElement {
      const { defaultSize, minSize = 0, maxSize = 100 } = panelOptions;
      const el = document.createElement('div');
      el.setAttribute('data-panel', '');
      panels.push({ el, minSize, maxSize });

      const sizes = state.sizes.peek();
      if (defaultSize != null) {
        sizes.push(defaultSize);
      } else {
        const equalSize = 100 / panels.length;
        sizes.length = 0;
        for (let i = 0; i < panels.length; i++) {
          sizes.push(equalSize);
        }
      }
      updateSizes(sizes);

      root.appendChild(el);
      return el;
    }

    function Handle(): HTMLDivElement {
      const handleIndex = handles.length;
      const handle = document.createElement('div');
      handle.setAttribute('role', 'separator');
      handle.setAttribute('tabindex', '0');
      handle.setAttribute('data-orientation', orientation);
      setDataState(handle, 'idle');

      handles.push(handle);

      const STEP = 5;
      handle.addEventListener('keydown', (event) => {
        const sizes = [...state.sizes.peek()];
        const leftIdx = handleIndex;
        const rightIdx = handleIndex + 1;
        const leftPanel = panels[leftIdx];
        const rightPanel = panels[rightIdx];
        if (!leftPanel || !rightPanel) return;

        let leftSize = sizes[leftIdx] ?? 0;
        let rightSize = sizes[rightIdx] ?? 0;
        const growKey = orientation === 'horizontal' ? Keys.ArrowRight : Keys.ArrowDown;
        const shrinkKey = orientation === 'horizontal' ? Keys.ArrowLeft : Keys.ArrowUp;

        if (isKey(event, growKey)) {
          event.preventDefault();
          const delta = Math.min(
            STEP,
            rightSize - rightPanel.minSize,
            leftPanel.maxSize - leftSize,
          );
          leftSize += delta;
          rightSize -= delta;
        } else if (isKey(event, shrinkKey)) {
          event.preventDefault();
          const delta = Math.min(
            STEP,
            leftSize - leftPanel.minSize,
            rightPanel.maxSize - rightSize,
          );
          leftSize -= delta;
          rightSize += delta;
        } else if (isKey(event, Keys.Home)) {
          event.preventDefault();
          const delta = leftSize - leftPanel.minSize;
          leftSize -= delta;
          rightSize += delta;
        } else if (isKey(event, Keys.End)) {
          event.preventDefault();
          const delta = rightSize - rightPanel.minSize;
          leftSize += delta;
          rightSize -= delta;
        } else {
          return;
        }

        sizes[leftIdx] = leftSize;
        sizes[rightIdx] = rightSize;
        updateSizes(sizes);
      });

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        setDataState(handle, 'dragging');

        const startPos = orientation === 'horizontal' ? event.clientX : event.clientY;
        const rootSize = orientation === 'horizontal' ? root.offsetWidth : root.offsetHeight;
        const startSizes = [...state.sizes.peek()];

        function onMove(e: PointerEvent): void {
          const currentPos = orientation === 'horizontal' ? e.clientX : e.clientY;
          const delta = ((currentPos - startPos) / rootSize) * 100;

          const sizes = [...startSizes];
          const leftIdx = handleIndex;
          const rightIdx = handleIndex + 1;
          const leftPanel = panels[leftIdx];
          const rightPanel = panels[rightIdx];
          if (!leftPanel || !rightPanel) return;

          let newLeft = (startSizes[leftIdx] ?? 0) + delta;
          let newRight = (startSizes[rightIdx] ?? 0) - delta;

          newLeft = Math.max(leftPanel.minSize, Math.min(leftPanel.maxSize, newLeft));
          newRight = Math.max(rightPanel.minSize, Math.min(rightPanel.maxSize, newRight));

          sizes[leftIdx] = newLeft;
          sizes[rightIdx] = newRight;
          updateSizes(sizes);
        }

        function onUp(e: PointerEvent): void {
          handle.releasePointerCapture(e.pointerId);
          setDataState(handle, 'idle');
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
        }

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      });

      root.appendChild(handle);
      return handle;
    }

    return { root, state, Panel, Handle };
  },
};
