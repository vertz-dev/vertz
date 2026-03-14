/**
 * Composed Tabs — high-level composable component built on top of Tabs.Root.
 * Handles slot scanning, trigger/panel wiring, and class distribution via context.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Tabs } from './tabs';

// ---------------------------------------------------------------------------
// Class distribution context
// ---------------------------------------------------------------------------

export interface TabsClasses {
  list?: string;
  trigger?: string;
  panel?: string;
}

const TabsClassesContext = createContext<TabsClasses | undefined>(
  undefined,
  '@vertz/ui-primitives::TabsClassesContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  class?: string;
}

interface TriggerProps extends SlotProps {
  value: string;
}

interface ContentProps extends SlotProps {
  value: string;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function TabsList({ children }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'tabs-list';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function TabsTrigger({ value, children, class: cls }: TriggerProps): HTMLElement {
  const el = document.createElement('span');
  el.dataset.slot = 'tabs-trigger';
  el.dataset.value = value;
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function TabsContent({ value, children, class: cls }: ContentProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'tabs-content';
  el.dataset.value = value;
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
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

function ComposedTabsRoot({
  children,
  classes,
  defaultValue,
  onValueChange,
}: ComposedTabsProps): HTMLElement {
  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[];
  TabsClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes!);
  const listEntry = slots.get('tabs-list')?.[0];
  const contentEntries = slots.get('tabs-content') ?? [];

  // Create the low-level tabs primitive
  const tabs = Tabs.Root({ defaultValue, onValueChange });

  // Apply list class
  if (classes?.list) {
    tabs.list.className = classes.list;
  }

  // Process triggers from the list slot
  if (listEntry) {
    const triggerSlots = scanSlots(
      listEntry.children.filter((n): n is HTMLElement => n instanceof HTMLElement),
    );
    const triggerEntries = triggerSlots.slots.get('tabs-trigger') ?? [];

    for (const triggerEntry of triggerEntries) {
      const value = triggerEntry.attrs.value;
      if (!value) continue;

      const { trigger, panel } = tabs.Tab(value);

      // Apply trigger class
      const triggerClass = [classes?.trigger, triggerEntry.attrs.class].filter(Boolean).join(' ');
      if (triggerClass) trigger.className = triggerClass;

      // Move trigger children into the primitive trigger
      trigger.textContent = '';
      for (const node of triggerEntry.children) {
        trigger.appendChild(node);
      }

      // Find matching content entry and move its children into the panel
      const contentEntry = contentEntries.find((ce) => ce.attrs.value === value);
      if (contentEntry) {
        const panelClass = [classes?.panel, contentEntry.attrs.class].filter(Boolean).join(' ');
        if (panelClass) panel.className = panelClass;

        for (const node of contentEntry.children) {
          panel.appendChild(node);
        }
      }
    }
  }

  return tabs.root;
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedTabs: ((props: ComposedTabsProps) => HTMLElement) & {
  __classKeys?: TabsClassKey;
  List: typeof TabsList;
  Trigger: typeof TabsTrigger;
  Content: typeof TabsContent;
} = Object.assign(ComposedTabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
});
