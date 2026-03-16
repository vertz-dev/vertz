/**
 * Composed Tabs — fully declarative JSX component with roving tabindex and ARIA.
 * Sub-components self-wire via context. No factory wrapping.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { setRovingTabindex } from '../utils/focus';
import { uniqueId } from '../utils/id';
import { handleListNavigation } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface TabsClasses {
  list?: string;
  trigger?: string;
  panel?: string;
}

// ---------------------------------------------------------------------------
// Registration types
// ---------------------------------------------------------------------------

interface TabRegistration {
  value: string;
  triggerId: string;
  panelId: string;
  triggerChildren: ChildValue;
  triggerClass: string | undefined;
  panelChildren: ChildValue;
  panelClass: string | undefined;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TabsContextValue {
  classes?: TabsClasses;
  /** @internal — registers a trigger by value */
  _registerTrigger: (value: string, children: ChildValue, cls?: string) => void;
  /** @internal — registers content children by value */
  _registerContent: (value: string, children: ChildValue, cls?: string) => void;
  /** @internal — duplicate detection */
  _triggersClaimed: Set<string>;
  _contentsClaimed: Set<string>;
}

const TabsContext = createContext<TabsContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::TabsContext',
);

function useTabsContext(componentName: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(
      `<Tabs.${componentName}> must be used inside <Tabs>. ` +
        'Ensure it is a direct or nested child of the Tabs root component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface TriggerProps extends SlotProps {
  value: string;
}

interface ContentProps extends SlotProps {
  value: string;
}

// ---------------------------------------------------------------------------
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function TabsList({ children }: SlotProps) {
  // Resolves children (Triggers) for their registration side effects.
  // The actual tablist element is rendered by Root.
  useTabsContext('List');
  resolveChildren(children);
  return (<span style="display: contents" />) as HTMLElement;
}

function TabsTrigger({ value, children, className: cls, class: classProp }: TriggerProps) {
  const ctx = useTabsContext('Trigger');
  if (ctx._triggersClaimed.has(value)) {
    console.warn(`Duplicate <Tabs.Trigger value="${value}"> detected – only the first is used`);
  }
  ctx._triggersClaimed.add(value);

  const effectiveCls = cls ?? classProp;
  ctx._registerTrigger(value, children, effectiveCls);

  // Return a placeholder — Root renders the real trigger button
  return (<span style="display: contents" />) as HTMLElement;
}

function TabsContent({ value, children, className: cls, class: classProp }: ContentProps) {
  const ctx = useTabsContext('Content');
  if (ctx._contentsClaimed.has(value)) {
    console.warn(`Duplicate <Tabs.Content value="${value}"> detected – only the first is used`);
  }
  ctx._contentsClaimed.add(value);

  const effectiveCls = cls ?? classProp;
  ctx._registerContent(value, children, effectiveCls);

  // Return a placeholder — Root renders the real panel
  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Element builders — standalone functions outside the Root component body so
// the Vertz compiler does not classify their return values as computed().
// ---------------------------------------------------------------------------

function buildTriggerEl(tab: TabRegistration, classes: TabsClasses | undefined): HTMLElement {
  const triggerClass = [classes?.trigger, tab.triggerClass].filter(Boolean).join(' ');
  const resolvedChildren = resolveChildren(tab.triggerChildren);
  const isActive = false; // initial active state set by caller via setAttribute
  return (
    <button
      type="button"
      role="tab"
      id={tab.triggerId}
      aria-controls={tab.panelId}
      data-value={tab.value}
      aria-selected={isActive ? 'true' : 'false'}
      data-state={isActive ? 'active' : 'inactive'}
      tabindex={isActive ? '0' : '-1'}
      class={triggerClass || undefined}
    >
      {...resolvedChildren}
    </button>
  ) as HTMLElement;
}

function buildPanelEl(tab: TabRegistration, classes: TabsClasses | undefined): HTMLElement {
  const panelClass = [classes?.panel, tab.panelClass].filter(Boolean).join(' ');
  const resolvedChildren = resolveChildren(tab.panelChildren);
  const isActive = false; // initial active state set by caller via setAttribute
  return (
    <div
      role="tabpanel"
      id={tab.panelId}
      aria-labelledby={tab.triggerId}
      tabindex="0"
      aria-hidden={isActive ? 'false' : 'true'}
      data-state={isActive ? 'active' : 'inactive'}
      style={isActive ? '' : 'display: none'}
      class={panelClass || undefined}
    >
      {...resolvedChildren}
    </div>
  ) as HTMLElement;
}

// Apply active state to a trigger element imperatively.
function applyTriggerActive(el: HTMLElement, isActive: boolean): void {
  el.setAttribute('aria-selected', isActive ? 'true' : 'false');
  el.setAttribute('data-state', isActive ? 'active' : 'inactive');
  el.setAttribute('tabindex', isActive ? '0' : '-1');
}

// Apply active state to a panel element imperatively.
function applyPanelActive(el: HTMLElement, isActive: boolean): void {
  el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  el.setAttribute('data-state', isActive ? 'active' : 'inactive');
  el.style.display = isActive ? '' : 'none';
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedTabsProps {
  children?: ChildValue;
  classes?: TabsClasses;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
}

export type TabsClassKey = keyof TabsClasses;

// Helper to build context value — avoids compiler wrapping object literal in computed().
function buildTabsCtx(
  classes: TabsClasses | undefined,
  registerTrigger: (value: string, children: ChildValue, cls?: string) => void,
  registerContent: (value: string, children: ChildValue, cls?: string) => void,
): TabsContextValue {
  return {
    classes,
    _registerTrigger: registerTrigger,
    _registerContent: registerContent,
    _triggersClaimed: new Set(),
    _contentsClaimed: new Set(),
  };
}

function ComposedTabsRoot({
  children,
  classes,
  defaultValue = '',
  onValueChange,
  orientation = 'horizontal',
}: ComposedTabsProps) {
  // Registration storage — plain object so the compiler doesn't signal-transform it
  const reg: {
    tabs: TabRegistration[];
    tabMap: Map<string, TabRegistration>;
  } = { tabs: [], tabMap: new Map() };

  const ctxValue = buildTabsCtx(
    classes,
    (value, triggerChildren, triggerClass) => {
      if (!reg.tabMap.has(value)) {
        const baseId = uniqueId('tab');
        const entry: TabRegistration = {
          value,
          triggerId: `${baseId}-trigger`,
          panelId: `${baseId}-panel`,
          triggerChildren,
          triggerClass,
          panelChildren: undefined,
          panelClass: undefined,
        };
        reg.tabs.push(entry);
        reg.tabMap.set(value, entry);
      }
    },
    (value, panelChildren, panelClass) => {
      const entry = reg.tabMap.get(value);
      if (entry && entry.panelChildren === undefined) {
        entry.panelChildren = panelChildren;
        entry.panelClass = panelClass;
      }
    },
  );

  // Phase 1: resolve children to collect registrations
  TabsContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // Phase 2: build trigger and panel elements.
  // Use plain arrays with a loop — the compiler only transforms top-level
  // `const` assignments; variables inside loop bodies are not analyzed.
  const triggerEls: HTMLElement[] = [];
  const panelEls: HTMLElement[] = [];

  for (const tab of reg.tabs) {
    triggerEls.push(buildTriggerEl(tab, classes));
    panelEls.push(buildPanelEl(tab, classes));
  }

  // Apply initial active state imperatively
  const initialIdx = reg.tabs.findIndex((t) => t.value === defaultValue);
  for (let i = 0; i < triggerEls.length; i++) {
    applyTriggerActive(triggerEls[i]!, i === initialIdx);
    applyPanelActive(panelEls[i]!, i === initialIdx);
  }
  setRovingTabindex(triggerEls, initialIdx);

  function selectTab(value: string): void {
    const activeIdx = reg.tabs.findIndex((t) => t.value === value);
    for (let i = 0; i < reg.tabs.length; i++) {
      applyTriggerActive(triggerEls[i]!, i === activeIdx);
      applyPanelActive(panelEls[i]!, i === activeIdx);
    }
    setRovingTabindex(triggerEls, activeIdx);
    onValueChange?.(value);
  }

  // Wire click handlers on each trigger (explicit for cleanup)
  for (let i = 0; i < triggerEls.length; i++) {
    const triggerEl = triggerEls[i]!;
    const tabValue = reg.tabs[i]!.value;
    const handleClick = () => {
      selectTab(tabValue);
      triggerEl.focus();
    };
    triggerEl.addEventListener('click', handleClick);
    _tryOnCleanup(() => triggerEl.removeEventListener('click', handleClick));
  }

  // Build the tablist element with all trigger children
  const tabListEl = (
    <div
      role="tablist"
      aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
      class={classes?.list || undefined}
    >
      {...triggerEls}
    </div>
  ) as HTMLElement;

  const handleKeydown = (event: KeyboardEvent) => {
    const result = handleListNavigation(event, triggerEls, { orientation });
    if (result) {
      const idx = triggerEls.indexOf(result);
      const tab = reg.tabs[idx];
      if (tab) selectTab(tab.value);
    }
  };
  tabListEl.addEventListener('keydown', handleKeydown);
  _tryOnCleanup(() => tabListEl.removeEventListener('keydown', handleKeydown));

  return (
    <div>
      {tabListEl}
      {...panelEls}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedTabs = Object.assign(ComposedTabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
}) as ((props: ComposedTabsProps) => HTMLElement) & {
  __classKeys?: TabsClassKey;
  List: (props: SlotProps) => HTMLElement;
  Trigger: (props: TriggerProps) => HTMLElement;
  Content: (props: ContentProps) => HTMLElement;
};
