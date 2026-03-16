/**
 * Composed Select — high-level composable component built on Select.Root.
 * Sub-components self-wire via context. No slot scanning.
 * Uses context override for groups: Group provides a sub-context where
 * _createItem delegates to group.Item() instead of select.Item().
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import type { FloatingOptions } from '../utils/floating';
import { Select } from './select';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface SelectClasses {
  trigger?: string;
  content?: string;
  item?: string;
  itemIndicator?: string;
  group?: string;
  separator?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SelectContextValue {
  select: ReturnType<typeof Select.Root>;
  classes?: SelectClasses;
  /** Factory to create an item — overridden by Group sub-context */
  _createItem: (value: string, label?: string) => HTMLDivElement;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const SelectContext = createContext<SelectContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::SelectContext',
);

function useSelectContext(componentName: string): SelectContextValue {
  const ctx = useContext(SelectContext);
  if (!ctx) {
    throw new Error(
      `<Select.${componentName}> must be used inside <Select>. ` +
        'Ensure it is a direct or nested child of the Select root component.',
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

interface ItemProps extends SlotProps {
  value: string;
}

interface GroupProps extends SlotProps {
  label: string;
}

// ---------------------------------------------------------------------------
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

// Inline SVG strings for icons (same pattern as @vertz/icons renderIcon)
const CHEVRON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

function SelectTrigger(_props: SlotProps) {
  const ctx = useSelectContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <Select.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;
  const { select } = ctx;

  // Add chevron indicator to the trigger
  const chevron = (
    <span
      data-part="chevron"
      style="display: inline-flex; align-items: center; opacity: 0.5; flex-shrink: 0"
    />
  ) as HTMLSpanElement;
  chevron.innerHTML = CHEVRON_SVG;
  select.trigger.appendChild(chevron);

  return select.trigger;
}

function SelectContent({ children }: SlotProps) {
  const ctx = useSelectContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <Select.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;
  const { select } = ctx;

  // Resolve children (Items, Groups, Separators) for their registration side effects
  resolveChildren(children);

  return select.content;
}

const CHECK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function SelectItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const { _createItem, classes } = useSelectContext('Item');
  const effectiveCls = cls ?? classProp;

  // Extract label from children
  const resolved = resolveChildren(children);
  const label = resolved
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();

  const item = _createItem(value, label || undefined);

  // Apply item class
  const itemClass = [classes?.item, effectiveCls].filter(Boolean).join(' ');
  if (itemClass) item.className = itemClass;

  // Add check indicator (hidden by default, shown via CSS when aria-selected="true")
  const indicator = (
    <span data-part="indicator" style="display: none" class={classes?.itemIndicator || undefined} />
  ) as HTMLSpanElement;
  indicator.innerHTML = CHECK_SVG;
  item.appendChild(indicator);

  return item;
}

function SelectGroup({ label, children }: GroupProps) {
  const ctx = useSelectContext('Group');
  const group = ctx.select.Group(label);

  if (ctx.classes?.group) group.el.className = ctx.classes.group;

  // Override _createItem in sub-context so nested Items use group.Item()
  SelectContext.Provider({ ...ctx, _createItem: (v, l) => group.Item(v, l) }, () => {
    resolveChildren(children);
  });

  return group.el;
}

function SelectSeparator(_props: SlotProps) {
  const { select, classes } = useSelectContext('Separator');
  const sep = select.Separator();
  if (classes?.separator) sep.className = classes.separator;
  return sep;
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
  positioning?: FloatingOptions;
}

export type SelectClassKey = keyof SelectClasses;

function ComposedSelectRoot({
  children,
  classes,
  defaultValue,
  placeholder,
  onValueChange,
  positioning,
}: ComposedSelectProps) {
  const select = Select.Root({
    defaultValue,
    placeholder,
    onValueChange,
    positioning,
  });

  // Apply trigger class
  if (classes?.trigger) {
    select.trigger.className = classes.trigger;
  }

  // Apply content class
  if (classes?.content) {
    select.content.className = classes.content;
  }

  const ctxValue: SelectContextValue = {
    select,
    classes,
    _createItem: (value, label) => select.Item(value, label),
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Resolve children for registration side effects
  SelectContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  return (
    <div style="display: contents">
      {select.trigger}
      {select.content}
    </div>
  );
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
