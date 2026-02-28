import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { Tabs } from '@vertz/ui-primitives';

interface TabsStyleClasses {
  readonly list: string;
  readonly trigger: string;
  readonly panel: string;
  readonly listLine: string;
  readonly triggerLine: string;
}

// ── Props ──────────────────────────────────────────────────

export interface TabsRootProps {
  defaultValue?: string;
  variant?: 'default' | 'line';
  children?: ChildValue;
}

export interface TabsSlotProps {
  children?: ChildValue;
  class?: string;
}

export interface TabsTriggerProps {
  value: string;
  children?: ChildValue;
  class?: string;
}

export interface TabsContentProps {
  value: string;
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedTabsComponent {
  (props: TabsRootProps): HTMLDivElement;
  List: (props: TabsSlotProps) => HTMLDivElement;
  Trigger: (props: TabsTriggerProps) => HTMLButtonElement;
  Content: (props: TabsContentProps) => HTMLDivElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedTabs(styles: TabsStyleClasses): ThemedTabsComponent {
  // ── Sub-components (slot markers) ──

  function TabsList({ children, class: className }: TabsSlotProps): HTMLDivElement {
    const el = document.createElement('div');
    el.dataset.slot = 'tabs-list';
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function TabsTrigger({ value, children, class: className }: TabsTriggerProps): HTMLButtonElement {
    const el = document.createElement('button');
    el.setAttribute('type', 'button');
    el.dataset.slot = 'tabs-trigger';
    el.dataset.value = value;
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function TabsContent({ value, children, class: className }: TabsContentProps): HTMLDivElement {
    const el = document.createElement('div');
    el.dataset.slot = 'tabs-content';
    el.dataset.value = value;
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  // ── Root orchestrator ──

  function TabsRoot({ defaultValue, variant, children }: TabsRootProps): HTMLDivElement {
    const isLine = variant === 'line';

    // 1. Create the Tabs primitive
    const result = Tabs.Root({ defaultValue });

    // 2. Apply list style
    result.list.classList.add(isLine ? styles.listLine : styles.list);

    // 3. Scan children for data-slot markers
    const childNodes = resolveChildren(children);

    let listSlot: HTMLElement | null = null;
    const triggerSlots: HTMLElement[] = [];
    const contentSlots: HTMLElement[] = [];

    for (const node of childNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;
      if (slot === 'tabs-list') {
        listSlot = node;
      } else if (slot === 'tabs-content') {
        contentSlots.push(node);
      }
    }

    // 4. Scan the list slot for trigger slots
    if (listSlot) {
      for (const child of Array.from(listSlot.childNodes)) {
        if (child instanceof HTMLElement && child.dataset.slot === 'tabs-trigger') {
          triggerSlots.push(child);
        }
      }
    }

    // 5. Build tabs by value — map of value → primitive tab result
    const tabsByValue = new Map<string, { trigger: HTMLButtonElement; panel: HTMLDivElement }>();

    // 6. For each trigger found, create a primitive tab and wire up
    for (const triggerEl of triggerSlots) {
      const value = triggerEl.dataset.value;
      if (!value) continue;

      const tab = result.Tab(value);
      tabsByValue.set(value, tab);

      // Apply trigger style class
      tab.trigger.classList.add(isLine ? styles.triggerLine : styles.trigger);

      // Clear default textContent (primitive sets value as label) then move children in
      tab.trigger.textContent = '';
      while (triggerEl.firstChild) {
        tab.trigger.appendChild(triggerEl.firstChild);
      }
    }

    // 7. For each content found, wire up to matching primitive tab panel
    for (const contentEl of contentSlots) {
      const value = contentEl.dataset.value;
      if (!value) continue;

      const tab = tabsByValue.get(value);
      if (!tab) continue;

      // Apply content style class
      tab.panel.classList.add(styles.panel);

      // Move the content element's child nodes into the primitive's panel
      while (contentEl.firstChild) {
        tab.panel.appendChild(contentEl.firstChild);
      }
    }

    return result.root;
  }

  // Attach sub-components to Root
  TabsRoot.List = TabsList;
  TabsRoot.Trigger = TabsTrigger;
  TabsRoot.Content = TabsContent;

  return TabsRoot as ThemedTabsComponent;
}
