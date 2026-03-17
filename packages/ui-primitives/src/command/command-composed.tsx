/**
 * Composed Command — fully declarative JSX implementation.
 * Sub-components self-wire via context. No factory delegation.
 *
 * Searchable command palette with filtering, keyboard navigation,
 * grouped items, and empty state handling.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { setHidden } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface CommandClasses {
  root?: string;
  input?: string;
  list?: string;
  item?: string;
  group?: string;
  groupHeading?: string;
  separator?: string;
  empty?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CommandContextValue {
  classes?: CommandClasses;
  onSelect?: (value: string) => void;
  placeholder?: string;
  /** @internal — registration storage shared between root and sub-components */
  _reg: {
    items: HTMLDivElement[];
    groups: Map<HTMLDivElement, { heading: HTMLDivElement; items: HTMLDivElement[] }>;
    inputEl: HTMLInputElement | null;
    listEl: HTMLDivElement | null;
    emptyEl: HTMLDivElement | null;
    /** When non-null, items being registered also push into this array (group tracking) */
    currentGroupItems: HTMLDivElement[] | null;
  };
}

const CommandContext = createContext<CommandContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::CommandContext',
);

function useCommandContext(componentName: string): CommandContextValue {
  const ctx = useContext(CommandContext);
  if (!ctx) {
    throw new Error(
      `<Command.${componentName}> must be used inside <Command>. ` +
        'Ensure it is a direct or nested child of the Command root component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface CommandInputProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface CommandListProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface CommandEmptyProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface CommandItemProps {
  value: string;
  children?: ChildValue;
  keywords?: string[];
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface CommandGroupProps {
  label: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface CommandSeparatorProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Element builders — outside component body to avoid computed() wrapping
// ---------------------------------------------------------------------------

function buildInputEl(inputClass: string, placeholder: string | undefined): HTMLInputElement {
  return (
    <input
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="true"
      placeholder={placeholder}
      class={inputClass || undefined}
    />
  ) as HTMLInputElement;
}

function buildListEl(listId: string, listClass: string, children: Node[]): HTMLDivElement {
  return (
    <div role="listbox" id={listId} class={listClass || undefined}>
      {...children}
    </div>
  ) as HTMLDivElement;
}

function buildEmptyEl(emptyClass: string, children: Node[]): HTMLDivElement {
  return (
    <div data-part="command-empty" aria-hidden="true" class={emptyClass || undefined}>
      {...children}
    </div>
  ) as HTMLDivElement;
}

function buildItemEl(
  value: string,
  itemClass: string,
  children: Node[],
  keywords: string[] | undefined,
  onItemClick: () => void,
): HTMLDivElement {
  return (
    <div
      role="option"
      data-value={value}
      aria-selected="false"
      data-keywords={keywords && keywords.length > 0 ? keywords.join(' ') : undefined}
      class={itemClass || undefined}
      onClick={() => {
        onItemClick();
      }}
    >
      {...children}
    </div>
  ) as HTMLDivElement;
}

function buildGroupEl(
  headingId: string,
  groupClass: string,
  heading: HTMLDivElement,
  children: Node[],
): HTMLDivElement {
  return (
    <div role="group" aria-labelledby={headingId} class={groupClass || undefined}>
      {heading}
      {...children}
    </div>
  ) as HTMLDivElement;
}

function buildHeadingEl(
  headingId: string,
  headingClass: string | undefined,
  label: string,
): HTMLDivElement {
  return (
    <div id={headingId} class={headingClass}>
      {label}
    </div>
  ) as HTMLDivElement;
}

function buildRootEl(rootClass: string | undefined, children: Node[]): HTMLElement {
  return (<div class={rootClass}>{...children}</div>) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function CommandInput({ className: cls, class: classProp }: CommandInputProps) {
  const ctx = useCommandContext('Input');
  const effectiveCls = cls ?? classProp;
  const inputClass = [ctx.classes?.input, effectiveCls].filter(Boolean).join(' ');
  const el = buildInputEl(inputClass, ctx.placeholder);
  ctx._reg.inputEl = el;
  return el;
}

function CommandList({ children, className: cls, class: classProp }: CommandListProps) {
  const ctx = useCommandContext('List');
  const effectiveCls = cls ?? classProp;
  const listClass = [ctx.classes?.list, effectiveCls].filter(Boolean).join(' ');
  const listId = uniqueId('command-list');
  const resolved = resolveChildren(children);
  const el = buildListEl(listId, listClass, resolved);
  ctx._reg.listEl = el;
  return el;
}

function CommandEmpty({ children, className: cls, class: classProp }: CommandEmptyProps) {
  const ctx = useCommandContext('Empty');
  const effectiveCls = cls ?? classProp;
  const emptyClass = [ctx.classes?.empty, effectiveCls].filter(Boolean).join(' ');
  const resolved = resolveChildren(children);
  const el = buildEmptyEl(emptyClass, resolved);
  ctx._reg.emptyEl = el;
  return el;
}

function CommandItem({
  value,
  children,
  keywords,
  className: cls,
  class: classProp,
}: CommandItemProps) {
  const ctx = useCommandContext('Item');
  const effectiveCls = cls ?? classProp;
  const itemClass = [ctx.classes?.item, effectiveCls].filter(Boolean).join(' ');
  const resolved = resolveChildren(children);
  const onSelect = ctx.onSelect;
  const el = buildItemEl(value, itemClass, resolved, keywords, () => {
    onSelect?.(value);
  });
  ctx._reg.items.push(el);
  if (ctx._reg.currentGroupItems) {
    ctx._reg.currentGroupItems.push(el);
  }
  return el;
}

function CommandGroup({ label, children, className: cls, class: classProp }: CommandGroupProps) {
  const ctx = useCommandContext('Group');
  const effectiveCls = cls ?? classProp;
  const groupClass = [ctx.classes?.group, effectiveCls].filter(Boolean).join(' ');
  const headingClass = ctx.classes?.groupHeading || undefined;
  const headingId = uniqueId('command-group');
  const heading = buildHeadingEl(headingId, headingClass, label);

  // Set up group item tracking — items will push into this array during resolve
  const groupItems: HTMLDivElement[] = [];
  const prevGroupItems = ctx._reg.currentGroupItems;
  ctx._reg.currentGroupItems = groupItems;
  const resolved = resolveChildren(children);
  // Restore previous group tracking (handles nested groups)
  ctx._reg.currentGroupItems = prevGroupItems;

  const el = buildGroupEl(headingId, groupClass, heading, resolved);
  ctx._reg.groups.set(el, { heading, items: groupItems });
  return el;
}

function CommandSeparator({ className: cls, class: classProp }: CommandSeparatorProps) {
  const ctx = useCommandContext('Separator');
  const effectiveCls = cls ?? classProp;
  const sepClass = [ctx.classes?.separator, effectiveCls].filter(Boolean).join(' ');
  return (<hr role="separator" class={sepClass || undefined} />) as HTMLHRElement;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedCommandProps {
  children?: ChildValue;
  classes?: CommandClasses;
  filter?: (value: string, search: string) => boolean;
  onSelect?: (value: string) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
}

export type CommandClassKey = keyof CommandClasses;

function ComposedCommandRoot({
  children,
  classes,
  filter: customFilter,
  onSelect,
  onInputChange,
  placeholder,
}: ComposedCommandProps) {
  const defaultFilter = (value: string, search: string): boolean =>
    value.toLowerCase().includes(search.toLowerCase());
  const filterFn = customFilter ?? defaultFilter;

  // Shared registration storage — sub-components write directly into this object
  const reg: CommandContextValue['_reg'] = {
    items: [],
    groups: new Map(),
    inputEl: null,
    listEl: null,
    emptyEl: null,
    currentGroupItems: null,
  };

  // State — plain object, not reactive (mutated by closures)
  const state: { activeIndex: number; resolvedNodes: Node[] } = {
    activeIndex: 0,
    resolvedNodes: [],
  };

  function getVisibleItems(): HTMLDivElement[] {
    return reg.items.filter((item) => item.getAttribute('aria-hidden') !== 'true');
  }

  function updateActiveItem(): void {
    const visible = getVisibleItems();
    for (const item of reg.items) {
      item.setAttribute('aria-selected', 'false');
    }
    if (visible.length > 0 && state.activeIndex >= 0 && state.activeIndex < visible.length) {
      visible[state.activeIndex]?.setAttribute('aria-selected', 'true');
    }
  }

  function runFilter(): void {
    const search = reg.inputEl?.value ?? '';
    let visibleCount = 0;

    for (const item of reg.items) {
      const value = item.getAttribute('data-value') ?? '';
      const text = item.textContent ?? '';
      const keywords = item.getAttribute('data-keywords') ?? '';
      const searchable = `${value} ${text} ${keywords}`;
      const matches = search === '' || filterFn(searchable, search);
      setHidden(item, !matches);
      if (matches) visibleCount++;
    }

    for (const [groupEl, group] of reg.groups) {
      const hasVisible = group.items.some((item) => item.getAttribute('aria-hidden') !== 'true');
      setHidden(group.heading, !hasVisible);
      if (!hasVisible) {
        groupEl.style.display = 'none';
      } else {
        groupEl.style.display = '';
      }
    }

    if (reg.emptyEl) {
      setHidden(reg.emptyEl, visibleCount > 0);
    }

    state.activeIndex = 0;
    updateActiveItem();
  }

  const ctxValue: CommandContextValue = {
    classes,
    onSelect,
    placeholder,
    _reg: reg,
  };

  // Phase 1: resolve children inside context to collect registrations
  CommandContext.Provider(ctxValue, () => {
    state.resolvedNodes = resolveChildren(children);
  });

  // Wire input event handlers after children have registered
  if (reg.inputEl) {
    const inputEl = reg.inputEl;

    inputEl.addEventListener('input', () => {
      onInputChange?.(inputEl.value);
      runFilter();
    });

    inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
      const visible = getVisibleItems();

      if (isKey(event, Keys.ArrowDown)) {
        event.preventDefault();
        const next = Math.min(state.activeIndex + 1, visible.length - 1);
        state.activeIndex = next;
        updateActiveItem();
        return;
      }

      if (isKey(event, Keys.ArrowUp)) {
        event.preventDefault();
        const prev = Math.max(state.activeIndex - 1, 0);
        state.activeIndex = prev;
        updateActiveItem();
        return;
      }

      if (isKey(event, Keys.Enter)) {
        event.preventDefault();
        const active = visible[state.activeIndex];
        if (active) {
          const val = active.getAttribute('data-value');
          if (val !== null) {
            onSelect?.(val);
          }
        }
        return;
      }

      if (isKey(event, Keys.Escape)) {
        event.preventDefault();
        inputEl.value = '';
        onInputChange?.('');
        runFilter();
      }
    });

    // Wire aria-controls to the list
    if (reg.listEl) {
      inputEl.setAttribute('aria-controls', reg.listEl.id);
    }
  }

  // Set initial active item
  updateActiveItem();

  return buildRootEl(classes?.root, state.resolvedNodes);
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedCommand = Object.assign(ComposedCommandRoot, {
  Input: CommandInput,
  List: CommandList,
  Empty: CommandEmpty,
  Item: CommandItem,
  Group: CommandGroup,
  Separator: CommandSeparator,
}) as ((props: ComposedCommandProps) => HTMLElement) & {
  __classKeys?: CommandClassKey;
  Input: (props: CommandInputProps) => HTMLElement;
  List: (props: CommandListProps) => HTMLElement;
  Empty: (props: CommandEmptyProps) => HTMLElement;
  Item: (props: CommandItemProps) => HTMLElement;
  Group: (props: CommandGroupProps) => HTMLElement;
  Separator: (props: CommandSeparatorProps) => HTMLElement;
};
