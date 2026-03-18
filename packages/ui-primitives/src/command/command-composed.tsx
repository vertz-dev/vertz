/**
 * Composed Command — compound component with keyboard navigation and filtering.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Items are discovered from the DOM via querySelectorAll when filtering runs.
 * No registration phase, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
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
  rootId: string;
  listId: string;
  classes?: CommandClasses;
  getOnSelect: () => ((value: string) => void) | undefined;
  placeholder?: string;
  handleInput: (inputEl: HTMLInputElement) => void;
  handleKeydown: (event: KeyboardEvent, inputEl: HTMLInputElement) => void;
  /** Returns true for the first item rendered, false for subsequent ones. */
  claimInitialActive: () => boolean;
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function CommandInput({ className: cls, class: classProp }: CommandInputProps) {
  const ctx = useCommandContext('Input');
  const effectiveCls = cls ?? classProp;
  const inputClass = [ctx.classes?.input, effectiveCls].filter(Boolean).join(' ');

  return (
    <input
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="true"
      aria-controls={ctx.listId}
      data-command-input=""
      placeholder={ctx.placeholder}
      class={inputClass || undefined}
      onInput={(e: Event) => {
        ctx.handleInput(e.target as HTMLInputElement);
      }}
      onKeydown={(e: KeyboardEvent) => {
        ctx.handleKeydown(e, e.target as HTMLInputElement);
      }}
    />
  );
}

function CommandList({ children, className: cls, class: classProp }: CommandListProps) {
  const ctx = useCommandContext('List');
  const effectiveCls = cls ?? classProp;
  const listClass = [ctx.classes?.list, effectiveCls].filter(Boolean).join(' ');

  return (
    <div role="listbox" id={ctx.listId} class={listClass || undefined}>
      {children}
    </div>
  );
}

function CommandEmpty({ children, className: cls, class: classProp }: CommandEmptyProps) {
  const ctx = useCommandContext('Empty');
  const effectiveCls = cls ?? classProp;
  const emptyClass = [ctx.classes?.empty, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      data-part="command-empty"
      data-command-empty=""
      aria-hidden="true"
      class={emptyClass || undefined}
    >
      {children}
    </div>
  );
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
  const isInitialActive = ctx.claimInitialActive();

  return (
    <div
      role="option"
      data-value={value}
      aria-selected={isInitialActive ? 'true' : 'false'}
      data-keywords={keywords && keywords.length > 0 ? keywords.join(' ') : undefined}
      class={itemClass || undefined}
      onClick={() => {
        ctx.getOnSelect()?.(value);
      }}
    >
      {children}
    </div>
  );
}

function CommandGroup({ label, children, className: cls, class: classProp }: CommandGroupProps) {
  const ctx = useCommandContext('Group');
  const effectiveCls = cls ?? classProp;
  const groupClass = [ctx.classes?.group, effectiveCls].filter(Boolean).join(' ');
  const headingClass = ctx.classes?.groupHeading || undefined;
  const headingId = uniqueId('command-group');

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      data-command-group=""
      class={groupClass || undefined}
    >
      <div id={headingId} data-command-group-heading="" class={headingClass}>
        {label}
      </div>
      {children}
    </div>
  );
}

function CommandSeparator({ className: cls, class: classProp }: CommandSeparatorProps) {
  const ctx = useCommandContext('Separator');
  const effectiveCls = cls ?? classProp;
  const sepClass = [ctx.classes?.separator, effectiveCls].filter(Boolean).join(' ');
  return <hr role="separator" class={sepClass || undefined} />;
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
  const rootId = uniqueId('command');
  const listId = uniqueId('command-list');

  const defaultFilter = (value: string, search: string): boolean =>
    value.toLowerCase().includes(search.toLowerCase());
  const filterFn = customFilter ?? defaultFilter;

  // Plain mutable state — not reactive, managed imperatively.
  const state: { activeIndex: number; initialClaimed: boolean } = {
    activeIndex: 0,
    initialClaimed: false,
  };

  /** First call returns true (for the first item), subsequent calls return false. */
  function claimInitialActive(): boolean {
    if (state.initialClaimed) return false;
    state.initialClaimed = true;
    return true;
  }

  /** Walk up from an element to find the command root by id. */
  function findRoot(el: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = el;
    while (current) {
      if (current.id === rootId) return current;
      current = current.parentElement;
    }
    return null;
  }

  function getItemsFrom(root: HTMLElement): HTMLDivElement[] {
    return [...root.querySelectorAll<HTMLDivElement>('[role="option"]')];
  }

  function getVisibleItemsFrom(root: HTMLElement): HTMLDivElement[] {
    return getItemsFrom(root).filter((item) => item.getAttribute('aria-hidden') !== 'true');
  }

  function updateActiveItemIn(root: HTMLElement): void {
    const allItems = getItemsFrom(root);
    const visible = getVisibleItemsFrom(root);
    for (const item of allItems) {
      item.setAttribute('aria-selected', 'false');
    }
    if (visible.length > 0 && state.activeIndex >= 0 && state.activeIndex < visible.length) {
      visible[state.activeIndex]?.setAttribute('aria-selected', 'true');
    }
  }

  function runFilterFrom(inputEl: HTMLInputElement, root: HTMLElement): void {
    const search = inputEl.value ?? '';
    const allItems = getItemsFrom(root);
    let visibleCount = 0;

    for (const item of allItems) {
      const value = item.getAttribute('data-value') ?? '';
      const text = item.textContent ?? '';
      const keywords = item.getAttribute('data-keywords') ?? '';
      const searchable = `${value} ${text} ${keywords}`;
      const matches = search === '' || filterFn(searchable, search);
      item.setAttribute('aria-hidden', String(!matches));
      item.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    }

    // Update group visibility
    const groups = root.querySelectorAll<HTMLElement>('[data-command-group]');
    for (const group of groups) {
      const groupItems = group.querySelectorAll<HTMLElement>('[role="option"]');
      const hasVisible = [...groupItems].some(
        (item) => item.getAttribute('aria-hidden') !== 'true',
      );
      const heading = group.querySelector<HTMLElement>('[data-command-group-heading]');
      if (heading) {
        heading.setAttribute('aria-hidden', String(!hasVisible));
        heading.style.display = hasVisible ? '' : 'none';
      }
      group.style.display = hasVisible ? '' : 'none';
    }

    // Update empty state
    const emptyEl = root.querySelector<HTMLElement>('[data-command-empty]');
    if (emptyEl) {
      const hide = visibleCount > 0;
      emptyEl.setAttribute('aria-hidden', String(hide));
      emptyEl.style.display = hide ? 'none' : '';
    }

    state.activeIndex = 0;
    updateActiveItemIn(root);
  }

  function handleInput(inputEl: HTMLInputElement): void {
    const root = findRoot(inputEl);
    if (!root) return;
    onInputChange?.(inputEl.value);
    runFilterFrom(inputEl, root);
  }

  function handleKeydown(event: KeyboardEvent, inputEl: HTMLInputElement): void {
    const root = findRoot(inputEl);
    if (!root) return;
    const visible = getVisibleItemsFrom(root);

    if (isKey(event, Keys.ArrowDown)) {
      event.preventDefault();
      const next = Math.min(state.activeIndex + 1, visible.length - 1);
      state.activeIndex = next;
      updateActiveItemIn(root);
      return;
    }

    if (isKey(event, Keys.ArrowUp)) {
      event.preventDefault();
      const prev = Math.max(state.activeIndex - 1, 0);
      state.activeIndex = prev;
      updateActiveItemIn(root);
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
      runFilterFrom(inputEl, root);
    }
  }

  const ctx: CommandContextValue = {
    rootId,
    listId,
    classes,
    getOnSelect: () => onSelect,
    placeholder,
    handleInput,
    handleKeydown,
    claimInitialActive,
  };

  return (
    <CommandContext.Provider value={ctx}>
      <div id={rootId} class={classes?.root || undefined}>
        {children}
      </div>
    </CommandContext.Provider>
  );
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
