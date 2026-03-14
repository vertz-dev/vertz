/**
 * Composed Select — high-level composable component built on Select.Root.
 * Handles slot scanning, item wiring, and class distribution via context.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Select } from './select';

// ---------------------------------------------------------------------------
// Class distribution context
// ---------------------------------------------------------------------------

export interface SelectClasses {
  trigger?: string;
  content?: string;
  item?: string;
  group?: string;
  separator?: string;
}

const SelectClassesContext = createContext<SelectClasses | undefined>(
  undefined,
  '@vertz/ui-primitives::SelectClassesContext',
);

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

function SelectTrigger({ children }: SlotProps): HTMLElement {
  const el = document.createElement('span');
  el.dataset.slot = 'select-trigger';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function SelectContent({ children }: SlotProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'select-content';
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function SelectItem({ value, children, class: cls }: ItemProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'select-item';
  el.dataset.value = value;
  el.style.display = 'contents';
  if (cls) el.dataset.class = cls;
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function SelectGroup({ label, children }: GroupProps): HTMLElement {
  const el = document.createElement('div');
  el.dataset.slot = 'select-group';
  el.dataset.label = label;
  el.style.display = 'contents';
  for (const node of resolveChildren(children)) {
    el.appendChild(node);
  }
  return el;
}

function SelectSeparator(_props: SlotProps): HTMLElement {
  const el = document.createElement('hr');
  el.dataset.slot = 'select-separator';
  return el;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedSelectProps {
  children?: ChildValue;
  classes?: SelectClasses;
  defaultValue?: string;
  placeholder?: string;
  onValueChange?: (value: string) => void;
}

export type SelectClassKey = keyof SelectClasses;

function ComposedSelectRoot({
  children,
  classes,
  defaultValue,
  placeholder,
  onValueChange,
}: ComposedSelectProps): HTMLElement {
  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[];
  SelectClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes!);
  const contentEntry = slots.get('select-content')?.[0];

  // Create the low-level select primitive
  const select = Select.Root({
    defaultValue,
    placeholder,
    onValueChange,
  });

  // Apply trigger class
  if (classes?.trigger) {
    select.trigger.className = classes.trigger;
  }

  // Apply content class
  if (classes?.content) {
    select.content.className = classes.content;
  }

  // Process content children: items, groups, separators
  if (contentEntry) {
    const contentChildren = contentEntry.children.filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
    processContentSlots(contentChildren, select, classes);
  }

  // Wrap trigger and content in a container so both are in the DOM
  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';
  wrapper.appendChild(select.trigger);
  wrapper.appendChild(select.content);

  return wrapper;
}

function processContentSlots(
  nodes: HTMLElement[],
  select: ReturnType<typeof Select.Root>,
  classes: SelectClasses | undefined,
  groupFactory?: ReturnType<typeof Select.Root>['Group'] extends (label: string) => infer R
    ? R
    : never,
): void {
  const { slots } = scanSlots(nodes);

  // Process items
  const itemEntries = slots.get('select-item') ?? [];
  for (const entry of itemEntries) {
    const value = entry.attrs.value;
    if (!value) continue;

    const label = entry.children
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();

    const item = groupFactory
      ? groupFactory.Item(value, label || undefined)
      : select.Item(value, label || undefined);

    const itemClass = [classes?.item, entry.attrs.class].filter(Boolean).join(' ');
    if (itemClass) item.className = itemClass;
  }

  // Process groups
  const groupEntries = slots.get('select-group') ?? [];
  for (const entry of groupEntries) {
    const label = entry.attrs.label ?? '';
    const group = select.Group(label);

    if (classes?.group) group.el.className = classes.group;

    // Process items inside the group
    const groupChildren = entry.children.filter((n): n is HTMLElement => n instanceof HTMLElement);
    processContentSlots(groupChildren, select, classes, group);
  }

  // Process separators
  const separatorEntries = slots.get('select-separator') ?? [];
  for (const _entry of separatorEntries) {
    const sep = select.Separator();
    if (classes?.separator) sep.className = classes.separator;
  }
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedSelect: ((props: ComposedSelectProps) => HTMLElement) & {
  __classKeys?: SelectClassKey;
  Trigger: typeof SelectTrigger;
  Content: typeof SelectContent;
  Item: typeof SelectItem;
  Group: typeof SelectGroup;
  Separator: typeof SelectSeparator;
} = Object.assign(ComposedSelectRoot, {
  Trigger: SelectTrigger,
  Content: SelectContent,
  Item: SelectItem,
  Group: SelectGroup,
  Separator: SelectSeparator,
});
