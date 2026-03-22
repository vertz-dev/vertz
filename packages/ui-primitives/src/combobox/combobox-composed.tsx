/**
 * Composed Combobox — compound component with autocomplete/typeahead.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * Input uses aria-activedescendant for virtual focus (not actual focus on options).
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';
import { setHiddenAnimated } from '../utils/aria';
import { linkedIds } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface ComboboxClasses {
  input?: string;
  content?: string;
  option?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ComboboxContextValue {
  isOpen: () => boolean;
  selectedValue: () => string;
  contentId: string;
  inputRef: Ref<HTMLInputElement>;
  contentRef: Ref<HTMLDivElement>;
  classes?: ComboboxClasses;
  open: () => void;
  close: () => void;
  selectOption: (value: string) => void;
  activeIndex: () => number;
  setActiveIndex: (index: number) => void;
  updateActiveDescendant: (index: number) => void;
  /** @internal Per-Root content instance counter for duplicate detection. */
  _contentCount: { value: number };
}

const ComboboxContext = createContext<ComboboxContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::ComboboxContext',
);

function useComboboxContext(componentName: string): ComboboxContextValue {
  const ctx = useContext(ComboboxContext);
  if (!ctx) {
    throw new Error(
      `<Combobox.${componentName}> must be used inside <ComposedCombobox>. ` +
        'Ensure it is a direct or nested child of the ComposedCombobox root component.',
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

interface OptionProps extends SlotProps {
  value: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ComboboxInput({ className: cls, class: classProp }: SlotProps) {
  const ctx = useComboboxContext('Input');

  return (
    <input
      ref={ctx.inputRef}
      type="text"
      role="combobox"
      data-combobox-input=""
      aria-autocomplete="list"
      aria-controls={ctx.contentId}
      aria-haspopup="listbox"
      aria-expanded="false"
      value={ctx.selectedValue()}
      class={cn(ctx.classes?.input, cls ?? classProp)}
      onInput={() => {
        const inputEl = ctx.inputRef.current;
        if (!inputEl) return;
        if (!ctx.isOpen()) ctx.open();
      }}
      onFocus={() => {
        const inputEl = ctx.inputRef.current;
        if (!inputEl) return;
        if (!ctx.isOpen() && inputEl.value.length > 0) ctx.open();
      }}
      onKeydown={(event: KeyboardEvent) => {
        if (isKey(event, Keys.Escape)) {
          event.preventDefault();
          ctx.close();
          return;
        }

        if (isKey(event, Keys.ArrowDown)) {
          event.preventDefault();
          if (!ctx.isOpen()) {
            ctx.open();
          }
          const contentEl = ctx.contentRef.current;
          if (!contentEl) return;
          const options = [...contentEl.querySelectorAll<HTMLElement>('[role="option"]')];
          const next = Math.min(ctx.activeIndex() + 1, options.length - 1);
          ctx.setActiveIndex(next);
          ctx.updateActiveDescendant(next);
          return;
        }

        if (isKey(event, Keys.ArrowUp)) {
          event.preventDefault();
          const prev = Math.max(ctx.activeIndex() - 1, 0);
          ctx.setActiveIndex(prev);
          ctx.updateActiveDescendant(prev);
          return;
        }

        if (isKey(event, Keys.Enter)) {
          event.preventDefault();
          const idx = ctx.activeIndex();
          const contentEl = ctx.contentRef.current;
          if (!contentEl) return;
          const options = [...contentEl.querySelectorAll<HTMLElement>('[role="option"]')];
          if (idx >= 0 && idx < options.length) {
            const val = options[idx]?.getAttribute('data-value');
            if (val != null) ctx.selectOption(val);
          }
          return;
        }
      }}
    />
  );
}

function ComboboxContent({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useComboboxContext('Content');

  const instanceIndex = ctx._contentCount.value++;
  if (instanceIndex > 0) {
    console.warn('Duplicate <Combobox.Content> detected \u2013 only the first is used');
  }

  return (
    <div
      ref={ctx.contentRef}
      role="listbox"
      id={ctx.contentId}
      data-combobox-content=""
      aria-hidden="true"
      data-state="closed"
      style={{ display: 'none' }}
      class={cn(ctx.classes?.content, cls ?? classProp)}
    >
      {children}
    </div>
  );
}

function ComboboxOption({ value, children, className: cls, class: classProp }: OptionProps) {
  const ctx = useComboboxContext('Option');
  const isSelected = ctx.selectedValue() === value;

  const optId = `${ctx.contentId}-opt-${value}`;

  return (
    <div
      role="option"
      id={optId}
      data-combobox-option=""
      data-value={value}
      aria-selected={isSelected ? 'true' : 'false'}
      data-state={isSelected ? 'active' : 'inactive'}
      class={cn(ctx.classes?.option, cls ?? classProp)}
      onClick={() => ctx.selectOption(value)}
    >
      {children ?? value}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedComboboxProps {
  children?: ChildValue;
  classes?: ComboboxClasses;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onInputChange?: (input: string) => void;
}

export type ComboboxClassKey = keyof ComboboxClasses;

function ComposedComboboxRoot({
  children,
  classes,
  defaultValue = '',
  onValueChange,
  onInputChange,
}: ComposedComboboxProps) {
  const ids = linkedIds('combobox');
  const inputRef: Ref<HTMLInputElement> = ref();
  const contentRef: Ref<HTMLDivElement> = ref();

  // Use a mutable container instead of `let` to avoid compiler signal
  // transforms. Signal-based state would cause children to re-evaluate
  // on every state change, re-creating sub-components and breaking refs.
  const state: {
    isOpen: boolean;
    selectedValue: string;
    activeIndex: number;
  } = {
    isOpen: false,
    selectedValue: defaultValue,
    activeIndex: -1,
  };

  function getInputEl(): HTMLInputElement | null {
    return inputRef.current ?? null;
  }

  function getContentEl(): HTMLDivElement | null {
    return contentRef.current ?? null;
  }

  function open(): void {
    state.isOpen = true;
    const inputEl = getInputEl();
    const contentEl = getContentEl();
    if (inputEl) {
      inputEl.setAttribute('aria-expanded', 'true');
    }
    if (contentEl) {
      contentEl.setAttribute('data-state', 'open');
      contentEl.setAttribute('aria-hidden', 'false');
      contentEl.style.display = '';
    }
  }

  function close(): void {
    state.isOpen = false;
    state.activeIndex = -1;
    const inputEl = getInputEl();
    const contentEl = getContentEl();
    if (inputEl) {
      inputEl.setAttribute('aria-expanded', 'false');
      inputEl.removeAttribute('aria-activedescendant');
    }
    if (contentEl) {
      contentEl.setAttribute('data-state', 'closed');
      setHiddenAnimated(contentEl, true);
    }
  }

  function selectOption(value: string): void {
    state.selectedValue = value;
    const inputEl = getInputEl();
    if (inputEl) {
      inputEl.value = value;
    }
    // Update aria-selected on all options
    const contentEl = getContentEl();
    if (contentEl) {
      const options = contentEl.querySelectorAll<HTMLElement>('[role="option"]');
      for (const opt of options) {
        const isActive = opt.getAttribute('data-value') === value;
        opt.setAttribute('aria-selected', isActive ? 'true' : 'false');
        opt.setAttribute('data-state', isActive ? 'active' : 'inactive');
      }
    }
    onValueChange?.(value);
    close();
    inputEl?.focus();
  }

  function updateActiveDescendant(index: number): void {
    const inputEl = getInputEl();
    const contentEl = getContentEl();
    if (!inputEl || !contentEl) return;

    const options = [...contentEl.querySelectorAll<HTMLElement>('[role="option"]')];
    const opt = options[index];
    if (index >= 0 && opt) {
      inputEl.setAttribute('aria-activedescendant', opt.id);
      for (let i = 0; i < options.length; i++) {
        const el = options[i];
        if (el) el.setAttribute('data-state', i === index ? 'active' : 'inactive');
      }
    } else {
      inputEl.removeAttribute('aria-activedescendant');
    }
  }

  const ctx: ComboboxContextValue = {
    isOpen: () => state.isOpen,
    selectedValue: () => state.selectedValue,
    contentId: ids.contentId,
    inputRef,
    contentRef,
    classes,
    open,
    close,
    selectOption,
    activeIndex: () => state.activeIndex,
    setActiveIndex: (index: number) => {
      state.activeIndex = index;
    },
    updateActiveDescendant,
    _contentCount: { value: 0 },
  };

  // Wrap open to also fire onInputChange
  const origOpen = ctx.open;
  ctx.open = () => {
    origOpen();
    const inputEl = getInputEl();
    if (inputEl && onInputChange) {
      onInputChange(inputEl.value);
    }
  };

  return (
    <ComboboxContext.Provider value={ctx}>
      <span style={{ display: 'contents' }} data-combobox-root="">
        {children}
      </span>
    </ComboboxContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedCombobox = Object.assign(ComposedComboboxRoot, {
  Input: ComboboxInput,
  Content: ComboboxContent,
  Option: ComboboxOption,
}) as ((props: ComposedComboboxProps) => HTMLElement) & {
  __classKeys?: ComboboxClassKey;
  Input: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Option: (props: OptionProps) => HTMLElement;
};
