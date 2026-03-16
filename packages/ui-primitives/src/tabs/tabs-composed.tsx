/**
 * Composed Tabs — high-level composable component built on top of Tabs.Root.
 * Sub-components self-wire via context. No slot scanning.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { Tabs } from './tabs';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface TabsClasses {
  list?: string;
  trigger?: string;
  panel?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TabsContextValue {
  tabs: ReturnType<typeof Tabs.Root>;
  classes?: TabsClasses;
  /** @internal — stores panel elements keyed by value for Content lookup */
  _panels: Map<string, HTMLElement>;
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
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function TabsList({ children }: SlotProps) {
  const { tabs, classes } = useTabsContext('List');

  if (classes?.list) {
    tabs.list.className = classes.list;
  }

  // Resolve children (Triggers) for their registration side effects
  resolveChildren(children);

  return tabs.list;
}

function TabsTrigger({ value, children, className: cls, class: classProp }: TriggerProps) {
  const { tabs, classes, _panels } = useTabsContext('Trigger');
  const effectiveCls = cls ?? classProp;

  const { trigger, panel } = tabs.Tab(value);

  // Apply trigger class
  const triggerClass = [classes?.trigger, effectiveCls].filter(Boolean).join(' ');
  if (triggerClass) trigger.className = triggerClass;

  // Move children into the primitive trigger
  trigger.textContent = '';
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    trigger.appendChild(node);
  }

  // Store panel reference for Content lookup
  _panels.set(value, panel);

  return trigger;
}

function TabsContent({ value, children, className: cls, class: classProp }: ContentProps) {
  const { classes, _panels } = useTabsContext('Content');
  const effectiveCls = cls ?? classProp;

  const panel = _panels.get(value);
  if (!panel) return (<div style="display: contents" />) as HTMLElement;

  // Apply panel class
  const panelClass = [classes?.panel, effectiveCls].filter(Boolean).join(' ');
  if (panelClass) panel.className = panelClass;

  // Move children into the primitive panel
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    panel.appendChild(node);
  }

  return panel;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedTabsProps {
  children?: ChildValue;
  classes?: TabsClasses;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export type TabsClassKey = keyof TabsClasses;

function ComposedTabsRoot({ children, classes, defaultValue, onValueChange }: ComposedTabsProps) {
  const tabs = Tabs.Root({ defaultValue, onValueChange });

  const ctxValue: TabsContextValue = {
    tabs,
    classes,
    _panels: new Map(),
  };

  // Resolve children for registration side effects
  // Triggers call tabs.Tab() which appends to tabs.list and tabs.root
  TabsContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  return tabs.root;
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
