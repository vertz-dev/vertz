/**
 * Composed DropdownMenu — high-level composable component built on Menu.Root.
 * Handles slot scanning, trigger wiring, item/group/separator processing,
 * and class distribution.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Menu } from '../menu/menu';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface DropdownMenuClasses {
  content?: string;
  item?: string;
  group?: string;
  label?: string;
  separator?: string;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  class?: string;
}

interface ItemProps extends SlotProps {
  value: string;
}

interface GroupProps extends SlotProps {
  label: string;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function MenuTrigger({ children }: SlotProps): HTMLElement {
  const el = document.createElement('span');
  el.dataset.slot = 'menu-trigger';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function MenuContent({ children }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'menu-content';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function MenuItem({ value, children, class: cls }: ItemProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'menu-item';
  el.dataset.value = value;
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function MenuGroup({ label, children }: GroupProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'menu-group';
  el.dataset.label = label;
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function MenuLabel({ children, class: cls }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'menu-label';
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function MenuSeparator(_props: SlotProps): HTMLElement {
  const el = document.createElement('hr');
  el.dataset.slot = 'menu-separator';
  return el;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedDropdownMenuProps {
  children?: ChildValue;
  classes?: DropdownMenuClasses;
  onSelect?: (value: string) => void;
}

export type DropdownMenuClassKey = keyof DropdownMenuClasses;

function ComposedDropdownMenuRoot({
  children,
  classes,
  onSelect,
}: ComposedDropdownMenuProps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';

  // Resolve children
  const resolvedNodes = resolveChildren(children);

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
  const triggerEntry = slots.get('menu-trigger')?.[0];
  const contentEntry = slots.get('menu-content')?.[0];

  // Extract user trigger element
  const userTrigger = triggerEntry
    ? ((triggerEntry.element.firstElementChild as HTMLElement) ?? triggerEntry.element)
    : null;

  // Create the low-level menu primitive
  const menu = Menu.Root({ onSelect });

  // Apply content class
  if (classes?.content) {
    menu.content.className = classes.content;
  }

  // Process content children: items, groups, labels, separators
  if (contentEntry) {
    const contentChildren = contentEntry.children.filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
    processMenuSlots(contentChildren, menu, classes);
  }

  // Wire the user's trigger
  if (userTrigger) {
    userTrigger.setAttribute('aria-haspopup', 'menu');
    userTrigger.setAttribute('aria-controls', menu.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    userTrigger.addEventListener('click', () => {
      menu.trigger.click();
    });

    // Sync ARIA state via MutationObserver
    const observer = new MutationObserver(() => {
      const isOpen = menu.trigger.getAttribute('aria-expanded') === 'true';
      userTrigger.setAttribute('aria-expanded', String(isOpen));
      userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
    });
    observer.observe(menu.trigger, { attributes: true, attributeFilter: ['aria-expanded'] });

    wrapper.appendChild(userTrigger);
  }

  wrapper.appendChild(menu.content);

  return wrapper;
}

function processMenuSlots(
  nodes: HTMLElement[],
  menu: ReturnType<typeof Menu.Root>,
  classes: DropdownMenuClasses | undefined,
  groupFactory?: ReturnType<typeof Menu.Root>['Group'] extends (label: string) => infer R
    ? R
    : never,
): void {
  const { slots } = scanSlots(nodes);

  // Process items
  const itemEntries = slots.get('menu-item') ?? [];
  for (const entry of itemEntries) {
    const value = entry.attrs.value;
    if (!value) continue;

    const label = entry.children
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();

    const item = groupFactory
      ? groupFactory.Item(value, label || undefined)
      : menu.Item(value, label || undefined);

    const itemClass = [classes?.item, entry.attrs.class].filter(Boolean).join(' ');
    if (itemClass) item.className = itemClass;
  }

  // Process groups
  const groupEntries = slots.get('menu-group') ?? [];
  for (const entry of groupEntries) {
    const label = entry.attrs.label ?? '';
    const group = menu.Group(label);

    if (classes?.group) group.el.className = classes.group;

    const groupChildren = entry.children.filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
    processMenuSlots(groupChildren, menu, classes, group);
  }

  // Process labels
  const labelEntries = slots.get('menu-label') ?? [];
  for (const entry of labelEntries) {
    const text = entry.children
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    const labelEl = menu.Label(text);

    const labelClass = [classes?.label, entry.attrs.class].filter(Boolean).join(' ');
    if (labelClass) labelEl.className = labelClass;
  }

  // Process separators
  const separatorEntries = slots.get('menu-separator') ?? [];
  for (const _entry of separatorEntries) {
    const sep = menu.Separator();
    if (classes?.separator) sep.className = classes.separator;
  }
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedDropdownMenu: ((props: ComposedDropdownMenuProps) => HTMLElement) & {
  __classKeys?: DropdownMenuClassKey;
  Trigger: typeof MenuTrigger;
  Content: typeof MenuContent;
  Item: typeof MenuItem;
  Group: typeof MenuGroup;
  Label: typeof MenuLabel;
  Separator: typeof MenuSeparator;
} = Object.assign(ComposedDropdownMenuRoot, {
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
  Group: MenuGroup,
  Label: MenuLabel,
  Separator: MenuSeparator,
});
