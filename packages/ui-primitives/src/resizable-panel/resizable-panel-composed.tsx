/**
 * Composed ResizablePanel — fully declarative compound component.
 * Panels and handles register via context. Sizes are reactive signals.
 * No DOM queries, no imperative DOM manipulation.
 * Follows WAI-ARIA separator pattern.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';

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
// Group ID — unique per root instance
// ---------------------------------------------------------------------------

const _groupCounter = { value: 0 };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PanelConfig {
  defaultSize?: number;
  minSize: number;
  maxSize: number;
}

interface ResizablePanelContextValue {
  groupId: string;
  orientation: 'horizontal' | 'vertical';
  classes?: ResizablePanelClasses;
  registerPanel: (opts: {
    defaultSize?: number;
    minSize?: number;
    maxSize?: number;
  }) => number;
  registerHandle: () => number;
  getSizeForPanel: (index: number) => number;
  getAriaForHandle: (index: number) => {
    valuenow: number;
    valuemin: number;
    valuemax: number;
  };
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
  const ctx = useContext(ResizablePanelContext);
  if (!ctx) {
    throw new Error(
      '<ResizablePanel.Panel> must be used inside <ResizablePanel>. ' +
        'Ensure it is a direct or nested child of the ResizablePanel root component.',
    );
  }
  const index = ctx.registerPanel({ defaultSize, minSize, maxSize });
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.panel, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      data-part="panel"
      data-group={ctx.groupId}
      style={{ flex: `${ctx.getSizeForPanel(index)} 1 0`, minWidth: 0, minHeight: 0 }}
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
  const handleIndex = ctx.registerHandle();
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.handle, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="separator"
      tabindex="0"
      style={{ flexShrink: 0 }}
      data-group={ctx.groupId}
      data-handle-index={String(handleIndex)}
      data-orientation={ctx.orientation}
      data-state="idle"
      aria-valuenow={String(ctx.getAriaForHandle(handleIndex).valuenow)}
      aria-valuemin={String(ctx.getAriaForHandle(handleIndex).valuemin)}
      aria-valuemax={String(ctx.getAriaForHandle(handleIndex).valuemax)}
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

  // Registration data — plain object, NOT reactive.
  const _reg = {
    nextPanelIdx: 0,
    nextHandleIdx: 0,
    panelConfigs: [] as PanelConfig[],
  };

  // Reactive sizes — panels read this for their flex style.
  // `let` becomes a signal via the compiler; panels track it reactively.
  let sizes: number[] = [];

  function recomputeSizes(): void {
    const configs = _reg.panelConfigs;
    const panelCount = configs.length;
    if (panelCount === 0) return;

    const newSizes: number[] = new Array(panelCount).fill(0);
    const explicitIndices = new Set<number>();

    for (let i = 0; i < panelCount; i++) {
      const config = configs[i];
      if (config && config.defaultSize != null) {
        newSizes[i] = config.defaultSize;
        explicitIndices.add(i);
      }
    }

    if (explicitIndices.size === 0) {
      const equal = 100 / panelCount;
      for (let i = 0; i < panelCount; i++) newSizes[i] = equal;
    } else {
      const used = [...explicitIndices].reduce((sum, i) => sum + (newSizes[i] ?? 0), 0);
      const unsetCount = panelCount - explicitIndices.size;
      const each = unsetCount > 0 ? (100 - used) / unsetCount : 0;
      for (let i = 0; i < newSizes.length; i++) {
        if (!explicitIndices.has(i)) newSizes[i] = each;
      }
    }

    sizes = newSizes;
  }

  function registerPanel(opts: {
    defaultSize?: number;
    minSize?: number;
    maxSize?: number;
  }): number {
    const idx = _reg.nextPanelIdx++;
    _reg.panelConfigs.push({
      defaultSize: opts.defaultSize,
      minSize: opts.minSize ?? 0,
      maxSize: opts.maxSize ?? 100,
    });
    recomputeSizes();
    return idx;
  }

  function registerHandle(): number {
    return _reg.nextHandleIdx++;
  }

  function getSizeForPanel(index: number): number {
    return sizes[index] ?? 0;
  }

  function getAriaForHandle(handleIndex: number): {
    valuenow: number;
    valuemin: number;
    valuemax: number;
  } {
    const config = _reg.panelConfigs[handleIndex];
    return {
      valuenow: Math.round(sizes[handleIndex] ?? 0),
      valuemin: Math.round(config?.minSize ?? 0),
      valuemax: Math.round(config?.maxSize ?? 100),
    };
  }

  function updateSizes(newSizes: number[]): void {
    sizes = [...newSizes];
    onResize?.(newSizes);
  }

  // Event delegation: keyboard resize
  function handleKeydown(e: Event): void {
    const ke = e as KeyboardEvent;
    const target = ke.target as HTMLElement;
    if (target.getAttribute('role') !== 'separator') return;
    if (target.dataset.group !== groupId) return;

    const handleIndex = Number(target.dataset.handleIndex ?? -1);
    if (handleIndex < 0) return;

    const leftIdx = handleIndex;
    const rightIdx = handleIndex + 1;
    const leftConfig = _reg.panelConfigs[leftIdx];
    const rightConfig = _reg.panelConfigs[rightIdx];
    if (!leftConfig || !rightConfig) return;

    const leftStart = sizes[leftIdx] ?? 0;
    const rightStart = sizes[rightIdx] ?? 0;
    const STEP = 5;
    const growKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    const shrinkKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';

    let newLeft = leftStart;
    let newRight = rightStart;

    if (ke.key === growKey) {
      ke.preventDefault();
      const delta = Math.min(STEP, rightStart - rightConfig.minSize, leftConfig.maxSize - leftStart);
      newLeft += delta;
      newRight -= delta;
    } else if (ke.key === shrinkKey) {
      ke.preventDefault();
      const delta = Math.min(STEP, leftStart - leftConfig.minSize, rightConfig.maxSize - rightStart);
      newLeft -= delta;
      newRight += delta;
    } else if (ke.key === 'Home') {
      ke.preventDefault();
      const delta = leftStart - leftConfig.minSize;
      newLeft -= delta;
      newRight += delta;
    } else if (ke.key === 'End') {
      ke.preventDefault();
      const delta = rightStart - rightConfig.minSize;
      newLeft += delta;
      newRight -= delta;
    } else {
      return;
    }

    const newSizes = sizes.slice();
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

    const handleIndex = Number(target.dataset.handleIndex ?? -1);
    const rootEl = pe.currentTarget as HTMLElement;
    const startPos = orientation === 'horizontal' ? pe.clientX : pe.clientY;
    const rootSize = orientation === 'horizontal' ? rootEl.offsetWidth : rootEl.offsetHeight;
    const startSizes = sizes.slice();

    function onMove(ev: PointerEvent): void {
      const currentPos = orientation === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = ((currentPos - startPos) / rootSize) * 100;

      const moveSizes = startSizes.slice();
      const leftIdx = handleIndex;
      const rightIdx = handleIndex + 1;
      const leftConfig = _reg.panelConfigs[leftIdx];
      const rightConfig = _reg.panelConfigs[rightIdx];
      if (!leftConfig || !rightConfig) return;

      const rawLeft = Math.max(
        leftConfig.minSize,
        Math.min(leftConfig.maxSize, (startSizes[leftIdx] ?? 0) + delta),
      );
      const rawRight = Math.max(
        rightConfig.minSize,
        Math.min(rightConfig.maxSize, (startSizes[rightIdx] ?? 0) - delta),
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

  const ctx: ResizablePanelContextValue = {
    groupId,
    orientation,
    classes,
    registerPanel,
    registerHandle,
    getSizeForPanel,
    getAriaForHandle,
  };

  return (
    <ResizablePanelContext.Provider value={ctx}>
      <div
        style={{ display: 'flex', flexDirection: orientation === 'horizontal' ? 'row' : 'column' }}
        data-orientation={orientation}
        data-panel-count={sizes.length}
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
