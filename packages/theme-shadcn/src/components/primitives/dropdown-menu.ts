import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { MenuOptions } from '@vertz/ui-primitives';
import { Menu } from '@vertz/ui-primitives';

let idCounter = 0;

interface DropdownMenuStyleClasses {
  readonly content: string;
  readonly item: string;
  readonly group: string;
  readonly label: string;
  readonly separator: string;
}

// ── Props ──────────────────────────────────────────────────

export interface DropdownMenuRootProps extends MenuOptions {
  children?: ChildValue;
  onOpenChange?: (isOpen: boolean) => void;
}

export interface DropdownMenuSlotProps {
  children?: ChildValue;
  class?: string;
}

export interface DropdownMenuItemProps {
  value: string;
  children?: ChildValue;
  class?: string;
}

export interface DropdownMenuGroupProps {
  label: string;
  children?: ChildValue;
  class?: string;
}

export interface DropdownMenuLabelProps {
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedDropdownMenuComponent {
  (props: DropdownMenuRootProps): HTMLElement;
  Trigger: (props: DropdownMenuSlotProps) => HTMLElement;
  Content: (props: DropdownMenuSlotProps) => HTMLElement;
  Item: (props: DropdownMenuItemProps) => HTMLDivElement;
  Group: (props: DropdownMenuGroupProps) => HTMLDivElement;
  Label: (props: DropdownMenuLabelProps) => HTMLDivElement;
  Separator: () => HTMLHRElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedDropdownMenu(
  styles: DropdownMenuStyleClasses,
): ThemedDropdownMenuComponent {
  function MenuTrigger({ children }: DropdownMenuSlotProps): HTMLElement {
    const el = document.createElement('span');
    el.dataset.slot = 'menu-trigger';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function MenuContent({ children }: DropdownMenuSlotProps): HTMLElement {
    const el = document.createElement('div');
    el.dataset.slot = 'menu-content';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function MenuItem({ value, children, class: className }: DropdownMenuItemProps): HTMLDivElement {
    const el = document.createElement('div');
    el.dataset.slot = 'menu-item';
    el.dataset.value = value;
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function MenuGroup({
    label,
    children,
    class: className,
  }: DropdownMenuGroupProps): HTMLDivElement {
    const el = document.createElement('div');
    el.dataset.slot = 'menu-group';
    el.dataset.label = label;
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function MenuLabel({ children, class: className }: DropdownMenuLabelProps): HTMLDivElement {
    const el = document.createElement('div');
    el.dataset.slot = 'menu-label';
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function MenuSeparator(): HTMLHRElement {
    const el = document.createElement('hr');
    el.dataset.slot = 'menu-separator';
    return el;
  }

  // ── Helpers ──

  function processItems(
    nodes: Node[],
    primitive: ReturnType<typeof Menu.Root>,
    parentGroup?: ReturnType<ReturnType<typeof Menu.Root>['Group']>,
  ): void {
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;

      if (slot === 'menu-item') {
        const value = node.dataset.value!;
        const label = node.textContent ?? undefined;
        const item = parentGroup ? parentGroup.Item(value, label) : primitive.Item(value, label);
        item.classList.add(styles.item);
      } else if (slot === 'menu-group') {
        const groupLabel = node.dataset.label!;
        const group = primitive.Group(groupLabel);
        group.el.classList.add(styles.group);

        // Add styled label
        const labelEl = document.createElement('div');
        labelEl.id = `menu-group-label-${++idCounter}`;
        labelEl.textContent = groupLabel;
        labelEl.classList.add(styles.label);
        group.el.removeAttribute('aria-label');
        group.el.setAttribute('aria-labelledby', labelEl.id);
        group.el.prepend(labelEl);

        // Process items inside the group
        processItems(Array.from(node.childNodes), primitive, group);
      } else if (slot === 'menu-label') {
        const labelEl = primitive.Label(node.textContent ?? '');
        labelEl.classList.add(styles.label);
      } else if (slot === 'menu-separator') {
        const sep = primitive.Separator();
        sep.classList.add(styles.separator);
      }
    }
  }

  function DropdownMenuRoot({
    children,
    onOpenChange: onOpenChangeOrig,
    ...menuOptions
  }: DropdownMenuRootProps): HTMLElement {
    let userTrigger: HTMLElement | null = null;
    let contentNodes: Node[] = [];

    for (const node of resolveChildren(children)) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;
      if (slot === 'menu-trigger') {
        userTrigger = (node.firstElementChild as HTMLElement) ?? node;
      } else if (slot === 'menu-content') {
        contentNodes = Array.from(node.childNodes);
      }
    }

    const primitive = Menu.Root({
      ...menuOptions,
      positioning: { placement: 'bottom-start', portal: true },
    });

    // Apply theme class
    primitive.content.classList.add(styles.content);

    // Process items/groups/separators/labels
    processItems(contentNodes, primitive);

    // Sync user trigger attributes with primitive state
    const observer = new MutationObserver(() => {
      const isOpen = primitive.trigger.getAttribute('aria-expanded') === 'true';
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChangeOrig?.(isOpen);
    });
    observer.observe(primitive.trigger, { attributes: true, attributeFilter: ['aria-expanded'] });

    // Wire user's trigger
    if (userTrigger) {
      userTrigger.setAttribute('aria-haspopup', 'menu');
      userTrigger.setAttribute('aria-controls', primitive.content.id);
      userTrigger.setAttribute('aria-expanded', 'false');
      userTrigger.setAttribute('data-state', 'closed');
      userTrigger.addEventListener('click', () => {
        primitive.trigger.click();
      });
      return userTrigger;
    }

    return primitive.trigger;
  }

  DropdownMenuRoot.Trigger = MenuTrigger;
  DropdownMenuRoot.Content = MenuContent;
  DropdownMenuRoot.Item = MenuItem;
  DropdownMenuRoot.Group = MenuGroup;
  DropdownMenuRoot.Label = MenuLabel;
  DropdownMenuRoot.Separator = MenuSeparator;

  return DropdownMenuRoot as ThemedDropdownMenuComponent;
}
