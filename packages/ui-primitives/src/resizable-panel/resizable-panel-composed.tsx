/**
 * Composed ResizablePanel — compound component with resizable split panels.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration callbacks, no child resolution, no internal API imports.
 * Follows WAI-ARIA separator pattern.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, useContext } from '@vertz/ui';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface ResizablePanelClasses {
  root?: string;
  panel?: string;
  handle?: string;
}

export type ResizablePanelClassKey = keyof ResizablePanelClasses;

// ---------------------------------------------------------------------------
// Group ID — unique per root instance to scope DOM queries
// ---------------------------------------------------------------------------

const _groupCounter = { value: 0 };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ResizablePanelContextValue {
  groupId: string;
  orientation: 'horizontal' | 'vertical';
  classes?: ResizablePanelClasses;
}

const ResizablePanelContext = createContext<ResizablePanelContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::ResizablePanelContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface PanelSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

interface HandleSlotProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function ResizablePanelPanel({
  children,
  className: cls,
  class: classProp,
  defaultSize,
  minSize,
  maxSize,
}: PanelSlotProps) {
  // NOTE: Direct useContext() call (not through a wrapper) so the compiler
  // recognises the result as a reactive source and generates reactive
  // __attr() bindings instead of static setAttribute() calls.
  const ctx = useContext(ResizablePanelContext);
  if (!ctx) {
    throw new Error(
      '<ResizablePanel.Panel> must be used inside <ResizablePanel>. ' +
        'Ensure it is a direct or nested child of the ResizablePanel root component.',
    );
  }
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.panel, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      data-part="panel"
      data-group={ctx.groupId}
      data-default-size={defaultSize != null ? String(defaultSize) : undefined}
      data-min-size={minSize != null ? String(minSize) : undefined}
      data-max-size={maxSize != null ? String(maxSize) : undefined}
      class={combined || undefined}
    >
      {children}
    </div>
  );
}

function ResizablePanelHandle({ className: cls, class: classProp }: HandleSlotProps) {
  const ctx = useContext(ResizablePanelContext);
  if (!ctx) {
    throw new Error(
      '<ResizablePanel.Handle> must be used inside <ResizablePanel>. ' +
        'Ensure it is a direct or nested child of the ResizablePanel root component.',
    );
  }
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.handle, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="separator"
      tabindex="0"
      data-group={ctx.groupId}
      data-orientation={ctx.orientation}
      data-state="idle"
      class={combined || undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export interface ComposedResizablePanelProps {
  children?: ChildValue;
  classes?: ResizablePanelClasses;
  orientation?: 'horizontal' | 'vertical';
  onResize?: (sizes: number[]) => void;
}

function ComposedResizablePanelRoot({
  children,
  classes,
  orientation = 'horizontal',
  onResize,
}: ComposedResizablePanelProps) {
  const groupId = String(_groupCounter.value++);

  // Mutable state container — using const object to avoid compiler
  // transforming `let` to reactive signals (which breaks object access).
  const _state = {
    panels: [] as { element: HTMLElement; minSize: number; maxSize: number }[],
    handles: [] as HTMLElement[],
    sizes: [] as number[],
  };

  function updateSizes(newSizes: number[]): void {
    _state.sizes = [...newSizes];
    for (let i = 0; i < _state.panels.length; i++) {
      const panel = _state.panels[i];
      if (panel) panel.element.style.flex = `0 0 ${newSizes[i] ?? 0}%`;
    }
    for (let i = 0; i < _state.handles.length; i++) {
      const handle = _state.handles[i];
      const leftPanel = _state.panels[i];
      if (handle && leftPanel) {
        const size = newSizes[i] ?? 0;
        handle.setAttribute('aria-valuenow', String(Math.round(size)));
        handle.setAttribute('aria-valuemin', String(Math.round(leftPanel.minSize)));
        handle.setAttribute('aria-valuemax', String(Math.round(leftPanel.maxSize)));
      }
    }
    onResize?.(newSizes);
  }

  function initPanels(rootEl: HTMLElement): void {
    // Query by group ID to scope to this instance — prevents picking up
    // panels/handles from nested ResizablePanel instances.
    _state.panels = [
      ...rootEl.querySelectorAll<HTMLElement>(`[data-part="panel"][data-group="${groupId}"]`),
    ].map((panelEl) => ({
      element: panelEl,
      minSize: Number(panelEl.dataset.minSize ?? 0),
      maxSize: Number(panelEl.dataset.maxSize ?? 100),
    }));
    _state.handles = [
      ...rootEl.querySelectorAll<HTMLElement>(`[role="separator"][data-group="${groupId}"]`),
    ];

    // Calculate initial sizes.
    // Use a Set to track which indices have explicit defaultSize,
    // so defaultSize={0} is not confused with "unset".
    const initialSizes: number[] = new Array(_state.panels.length).fill(0);
    const explicitIndices = new Set<number>();

    for (let i = 0; i < _state.panels.length; i++) {
      const ds = _state.panels[i]?.element.dataset.defaultSize;
      if (ds != null) {
        initialSizes[i] = Number(ds);
        explicitIndices.add(i);
      }
    }

    if (explicitIndices.size === 0) {
      const equal = 100 / _state.panels.length;
      for (let i = 0; i < _state.panels.length; i++) initialSizes[i] = equal;
    } else {
      const used = [...explicitIndices].reduce((sum, i) => sum + (initialSizes[i] ?? 0), 0);
      const unsetCount = _state.panels.length - explicitIndices.size;
      const each = unsetCount > 0 ? (100 - used) / unsetCount : 0;
      for (let i = 0; i < initialSizes.length; i++) {
        if (!explicitIndices.has(i)) initialSizes[i] = each;
      }
    }
    updateSizes(initialSizes);
  }

  // Event delegation: keyboard resize
  function handleKeydown(e: Event): void {
    const ke = e as KeyboardEvent;
    const target = ke.target as HTMLElement;
    if (target.getAttribute('role') !== 'separator') return;
    if (target.dataset.group !== groupId) return;

    const handleIndex = _state.handles.indexOf(target);
    if (handleIndex < 0) return;

    const leftIdx = handleIndex;
    const rightIdx = handleIndex + 1;
    const leftPanel = _state.panels[leftIdx];
    const rightPanel = _state.panels[rightIdx];
    if (!leftPanel || !rightPanel) return;

    const currentSizes = _state.sizes;
    const leftStart = currentSizes[leftIdx] ?? 0;
    const rightStart = currentSizes[rightIdx] ?? 0;
    const STEP = 5;
    const growKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    const shrinkKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';

    let newLeft = leftStart;
    let newRight = rightStart;

    if (ke.key === growKey) {
      ke.preventDefault();
      const delta = Math.min(STEP, rightStart - rightPanel.minSize, leftPanel.maxSize - leftStart);
      newLeft += delta;
      newRight -= delta;
    } else if (ke.key === shrinkKey) {
      ke.preventDefault();
      const delta = Math.min(STEP, leftStart - leftPanel.minSize, rightPanel.maxSize - rightStart);
      newLeft -= delta;
      newRight += delta;
    } else if (ke.key === 'Home') {
      ke.preventDefault();
      const delta = leftStart - leftPanel.minSize;
      newLeft -= delta;
      newRight += delta;
    } else if (ke.key === 'End') {
      ke.preventDefault();
      const delta = rightStart - rightPanel.minSize;
      newLeft += delta;
      newRight -= delta;
    } else {
      return;
    }

    const newSizes = [...currentSizes];
    newSizes[leftIdx] = newLeft;
    newSizes[rightIdx] = newRight;
    updateSizes(newSizes);
  }

  // Event delegation: pointer drag resize
  function handlePointerdown(e: Event): void {
    const pe = e as PointerEvent;
    const target = pe.target as HTMLElement;
    if (target.getAttribute('role') !== 'separator') return;
    if (target.dataset.group !== groupId) return;

    pe.preventDefault();
    target.setPointerCapture(pe.pointerId);
    target.setAttribute('data-state', 'dragging');

    const handleIndex = _state.handles.indexOf(target);
    const rootEl = pe.currentTarget as HTMLElement;
    const startPos = orientation === 'horizontal' ? pe.clientX : pe.clientY;
    const rootSize = orientation === 'horizontal' ? rootEl.offsetWidth : rootEl.offsetHeight;
    const startSizes = [..._state.sizes];

    function onMove(ev: PointerEvent): void {
      const currentPos = orientation === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = ((currentPos - startPos) / rootSize) * 100;

      const moveSizes = [...startSizes];
      const leftIdx = handleIndex;
      const rightIdx = handleIndex + 1;
      const leftPanel = _state.panels[leftIdx];
      const rightPanel = _state.panels[rightIdx];
      if (!leftPanel || !rightPanel) return;

      const rawLeft = Math.max(
        leftPanel.minSize,
        Math.min(leftPanel.maxSize, (startSizes[leftIdx] ?? 0) + delta),
      );
      const rawRight = Math.max(
        rightPanel.minSize,
        Math.min(rightPanel.maxSize, (startSizes[rightIdx] ?? 0) - delta),
      );

      moveSizes[leftIdx] = rawLeft;
      moveSizes[rightIdx] = rawRight;
      updateSizes(moveSizes);
    }

    function onUp(ev: PointerEvent): void {
      target.releasePointerCapture(ev.pointerId);
      target.setAttribute('data-state', 'idle');
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  }

  const ctx: ResizablePanelContextValue = { groupId, orientation, classes };

  // Use ref + queueMicrotask to avoid assigning JSX to a const (the compiler
  // wraps it in computed(), making it a signal instead of an HTMLElement).
  const rootRef: Ref<HTMLDivElement> = ref();
  queueMicrotask(() => {
    if (rootRef.current) initPanels(rootRef.current);
  });

  return (
    <ResizablePanelContext.Provider value={ctx}>
      <div
        ref={rootRef}
        style={{ display: 'flex', flexDirection: orientation === 'horizontal' ? 'row' : 'column' }}
        data-orientation={orientation}
        class={classes?.root}
        onKeydown={handleKeydown}
        onPointerdown={handlePointerdown}
      >
        {children}
      </div>
    </ResizablePanelContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedResizablePanel = Object.assign(ComposedResizablePanelRoot, {
  Panel: ResizablePanelPanel,
  Handle: ResizablePanelHandle,
}) as ((props: ComposedResizablePanelProps) => HTMLElement) & {
  __classKeys?: ResizablePanelClassKey;
  Panel: (props: PanelSlotProps) => HTMLElement;
  Handle: (props: HandleSlotProps) => HTMLElement;
};
