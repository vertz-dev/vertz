/**
 * Composed Tabs — high-level composable component built on top of Tabs.Root.
 * Handles slot scanning, trigger/panel wiring, and class distribution.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
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
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function TabsList({ children }: SlotProps) {
  return (
    <div data-slot="tabs-list" style="display: contents">
      {children}
    </div>
  );
}

function TabsTrigger({ value, children, className: cls, class: classProp }: TriggerProps) {
  const effectiveCls = cls ?? classProp;
  return (
    <span
      data-slot="tabs-trigger"
      data-value={value}
      data-class={effectiveCls || undefined}
      style="display: contents"
    >
      {children}
    </span>
  );
}

function TabsContent({ value, children, className: cls, class: classProp }: ContentProps) {
  const effectiveCls = cls ?? classProp;
  return (
    <div
      data-slot="tabs-content"
      data-value={value}
      data-class={effectiveCls || undefined}
      style="display: contents"
    >
      {children}
    </div>
  );
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
  // Resolve children to scan for structural slots
  const resolvedNodes = resolveChildren(children);

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
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
