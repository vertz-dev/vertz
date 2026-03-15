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
  className?: string;
  /** @deprecated Use `className` instead. */
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

function MenuTrigger({ children }: SlotProps) {
  return (
    <span data-slot="menu-trigger" style="display: contents">
      {children}
    </span>
  );
}

function MenuContent({ children }: SlotProps) {
  return (
    <div data-slot="menu-content" style="display: contents">
      {children}
    </div>
  );
}

function MenuItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const effectiveCls = cls ?? classProp;
  return (
    <div
      data-slot="menu-item"
      data-value={value}
      data-class={effectiveCls || undefined}
      style="display: contents"
    >
      {children}
    </div>
  );
}

function MenuGroup({ label, children }: GroupProps) {
  return (
    <div data-slot="menu-group" data-label={label} style="display: contents">
      {children}
    </div>
  );
}

function MenuLabel({ children, className: cls, class: classProp }: SlotProps) {
  const effectiveCls = cls ?? classProp;
  return (
    <div data-slot="menu-label" data-class={effectiveCls || undefined} style="display: contents">
      {children}
    </div>
  );
}

function MenuSeparator(_props: SlotProps) {
  return <hr data-slot="menu-separator" />;
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

function ComposedDropdownMenuRoot({ children, classes, onSelect }: ComposedDropdownMenuProps) {
  // Resolve children for slot scanning
  const resolvedNodes = resolveChildren(children);

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
  const triggerEntry = slots.get('menu-trigger')?.[0];
  const contentEntry = slots.get('menu-content')?.[0];

  // Extract user trigger element
  const userTrigger = triggerEntry
    ? ((triggerEntry.element.firstElementChild as HTMLElement) ?? triggerEntry.element)
    : null;

  // Create the low-level menu primitive with ARIA sync
  const menu = Menu.Root({
    onSelect,
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
    },
  });

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
  }

  return (
    <div style="display: contents">
      {userTrigger}
      {menu.content}
    </div>
  );
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

    const groupChildren = entry.children.filter((n): n is HTMLElement => n instanceof HTMLElement);
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

export const ComposedDropdownMenu = Object.assign(ComposedDropdownMenuRoot, {
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
  Group: MenuGroup,
  Label: MenuLabel,
  Separator: MenuSeparator,
}) as ((props: ComposedDropdownMenuProps) => HTMLElement) & {
  __classKeys?: DropdownMenuClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Label: (props: SlotProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
