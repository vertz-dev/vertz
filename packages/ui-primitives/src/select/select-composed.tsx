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

function SelectTrigger({ children }: SlotProps) {
  return (
    <span data-slot="select-trigger" style="display: contents">
      {children}
    </span>
  );
}

function SelectContent({ children }: SlotProps) {
  return (
    <div data-slot="select-content" style="display: contents">
      {children}
    </div>
  );
}

function SelectItem({ value, children, class: cls }: ItemProps) {
  return (
    <div
      data-slot="select-item"
      data-value={value}
      data-class={cls || undefined}
      style="display: contents"
    >
      {children}
    </div>
  );
}

function SelectGroup({ label, children }: GroupProps) {
  return (
    <div data-slot="select-group" data-label={label} style="display: contents">
      {children}
    </div>
  );
}

function SelectSeparator(_props: SlotProps) {
  return <hr data-slot="select-separator" />;
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
}: ComposedSelectProps) {
  // Provide classes via context, then resolve children inside the scope
  let resolvedNodes: Node[] = [];
  SelectClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // Scan for structural slots
  const { slots } = scanSlots(resolvedNodes);
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

  return (
    <div style="display: contents">
      {select.trigger}
      {select.content}
    </div>
  );
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

export const ComposedSelect = Object.assign(ComposedSelectRoot, {
  Trigger: SelectTrigger,
  Content: SelectContent,
  Item: SelectItem,
  Group: SelectGroup,
  Separator: SelectSeparator,
}) as ((props: ComposedSelectProps) => HTMLElement) & {
  __classKeys?: SelectClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
