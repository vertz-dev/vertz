import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { SelectOptions } from '@vertz/ui-primitives';
import { Select } from '@vertz/ui-primitives';

let idCounter = 0;

interface SelectStyleClasses {
  readonly trigger: string;
  readonly content: string;
  readonly item: string;
  readonly group: string;
  readonly label: string;
  readonly separator: string;
}

// ── Props ──────────────────────────────────────────────────

export interface SelectRootProps extends SelectOptions {
  children?: ChildValue;
}

export interface SelectSlotProps {
  children?: ChildValue;
  class?: string;
}

export interface SelectItemProps {
  value: string;
  children?: ChildValue;
  class?: string;
}

export interface SelectGroupProps {
  label: string;
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedSelectComponent {
  (props: SelectRootProps): HTMLElement;
  Trigger: (props: SelectSlotProps) => HTMLElement;
  Content: (props: SelectSlotProps) => HTMLElement;
  Item: (props: SelectItemProps) => HTMLDivElement;
  Group: (props: SelectGroupProps) => HTMLDivElement;
  Separator: (props: SelectSlotProps) => HTMLHRElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedSelect(styles: SelectStyleClasses): ThemedSelectComponent {
  function SelectTrigger({ children }: SelectSlotProps): HTMLElement {
    const el = document.createElement('span');
    el.dataset.slot = 'select-trigger';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function SelectContent({ children }: SelectSlotProps): HTMLElement {
    const el = document.createElement('div');
    el.dataset.slot = 'select-content';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function SelectItem({ value, children, class: className }: SelectItemProps): HTMLDivElement {
    const el = document.createElement('div');
    el.dataset.slot = 'select-item';
    el.dataset.value = value;
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function SelectGroup({ label, children, class: className }: SelectGroupProps): HTMLDivElement {
    const el = document.createElement('div');
    el.dataset.slot = 'select-group';
    el.dataset.label = label;
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function SelectSeparator(): HTMLHRElement {
    const el = document.createElement('hr');
    el.dataset.slot = 'select-separator';
    return el;
  }

  // ── Helpers ──

  function processItems(
    nodes: Node[],
    primitive: ReturnType<typeof Select.Root>,
    parentGroup?: ReturnType<ReturnType<typeof Select.Root>['Group']>,
  ): void {
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;

      if (slot === 'select-item') {
        const value = node.dataset.value!;
        const label = node.textContent ?? undefined;
        const item = parentGroup
          ? parentGroup.Item(value, label)
          : primitive.Item(value, label);
        item.classList.add(styles.item);
      } else if (slot === 'select-group') {
        const groupLabel = node.dataset.label!;
        const group = primitive.Group(groupLabel);
        group.el.classList.add(styles.group);

        // Add styled label
        const labelEl = document.createElement('div');
        labelEl.id = `select-group-label-${++idCounter}`;
        labelEl.textContent = groupLabel;
        labelEl.classList.add(styles.label);
        group.el.removeAttribute('aria-label');
        group.el.setAttribute('aria-labelledby', labelEl.id);
        group.el.prepend(labelEl);

        // Process items inside the group
        processItems(Array.from(node.childNodes), primitive, group);
      } else if (slot === 'select-separator') {
        const sep = primitive.Separator();
        sep.classList.add(styles.separator);
      }
    }
  }

  function SelectRoot({ children, ...options }: SelectRootProps): HTMLElement {
    let contentNodes: Node[] = [];

    for (const node of resolveChildren(children)) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;
      if (slot === 'select-trigger') {
        // Trigger children reserved for future label customization
      } else if (slot === 'select-content') {
        contentNodes = Array.from(node.childNodes);
      }
    }

    const primitive = Select.Root(options);

    // Apply theme classes
    primitive.trigger.classList.add(styles.trigger);
    primitive.content.classList.add(styles.content);

    // Process items/groups/separators inside content
    processItems(contentNodes, primitive);

    return primitive.trigger;
  }

  SelectRoot.Trigger = SelectTrigger;
  SelectRoot.Content = SelectContent;
  SelectRoot.Item = SelectItem;
  SelectRoot.Group = SelectGroup;
  SelectRoot.Separator = SelectSeparator;

  return SelectRoot as ThemedSelectComponent;
}
