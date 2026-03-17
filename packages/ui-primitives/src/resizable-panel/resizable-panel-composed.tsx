/**
 * Composed ResizablePanel — declarative JSX component with sub-components.
 * Follows WAI-ARIA separator pattern. Sub-components self-wire via context.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import type { PanelOptions, ResizablePanelOptions } from './resizable-panel';
import { ResizablePanel } from './resizable-panel';

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
// Context
// ---------------------------------------------------------------------------

type Registration =
  | { type: 'panel'; options: PanelOptions; children: ChildValue; cls?: string }
  | { type: 'handle'; cls?: string };

interface ResizablePanelContextValue {
  _register: (reg: Registration) => void;
}

const ResizablePanelContext = createContext<ResizablePanelContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::ResizablePanelContext',
);

function useResizablePanelContext(componentName: string): ResizablePanelContextValue {
  const ctx = useContext(ResizablePanelContext);
  if (!ctx) {
    throw new Error(
      `<ResizablePanel.${componentName}> must be used inside <ResizablePanel>. ` +
        'Ensure it is a direct or nested child of the ResizablePanel root component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface PanelSlotProps extends PanelOptions {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface HandleSlotProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ResizablePanelPanel({
  children,
  className: cls,
  class: classProp,
  defaultSize,
  minSize,
  maxSize,
}: PanelSlotProps) {
  const ctx = useResizablePanelContext('Panel');
  const effectiveCls = cls ?? classProp;
  ctx._register({
    type: 'panel',
    options: { defaultSize, minSize, maxSize },
    children,
    cls: effectiveCls,
  });
  return (<span style="display: contents" />) as HTMLElement;
}

function ResizablePanelHandle({ className: cls, class: classProp }: HandleSlotProps) {
  const ctx = useResizablePanelContext('Handle');
  const effectiveCls = cls ?? classProp;
  ctx._register({ type: 'handle', cls: effectiveCls });
  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Root
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
  orientation,
  onResize,
}: ComposedResizablePanelProps) {
  const registrations: Registration[] = [];

  const ctxValue: ResizablePanelContextValue = {
    _register: (reg) => {
      registrations.push(reg);
    },
  };

  // Phase 1: resolve children to collect registrations
  ResizablePanelContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // Phase 2: build using the low-level API
  const opts: ResizablePanelOptions = {};
  if (orientation) opts.orientation = orientation;
  if (onResize) opts.onResize = onResize;

  const rp = ResizablePanel.Root(opts);

  if (classes?.root) rp.root.classList.add(classes.root);

  for (const reg of registrations) {
    if (reg.type === 'panel') {
      const panel = rp.Panel(reg.options);
      if (classes?.panel) panel.classList.add(classes.panel);
      if (reg.cls) panel.classList.add(reg.cls);
      const nodes = resolveChildren(reg.children);
      for (const node of nodes) {
        if (node instanceof Node) {
          panel.appendChild(node);
        } else if (typeof node === 'string') {
          panel.appendChild(document.createTextNode(node));
        }
      }
    } else {
      const handle = rp.Handle();
      if (classes?.handle) handle.classList.add(classes.handle);
      if (reg.cls) handle.classList.add(reg.cls);
    }
  }

  return rp.root as HTMLElement;
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
