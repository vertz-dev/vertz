/**
 * Composed ToggleGroup — compound component with single/multi select.
 * Each Item renders its own DOM. Root provides shared state via context.
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface ToggleGroupClasses {
  root?: string;
  item?: string;
}

export type ToggleGroupClassKey = keyof ToggleGroupClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ToggleGroupContextValue {
  selectedValues: string[];
  classes?: ToggleGroupClasses;
  disabled: boolean;
  toggle: (value: string) => void;
  /** Returns true for the first item rendered, false for all subsequent. */
  claimFirstItem: () => boolean;
}

const ToggleGroupContext = createContext<ToggleGroupContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::ToggleGroupContext',
);

function useToggleGroupContext(componentName: string): ToggleGroupContextValue {
  const ctx = useContext(ToggleGroupContext);
  if (!ctx) {
    throw new Error(
      `<ToggleGroup.${componentName}> must be used inside <ToggleGroup>. ` +
        'Ensure it is a direct or nested child of the ToggleGroup root component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface ToggleGroupItemProps {
  value: string;
  children?: ChildValue;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function ToggleGroupItem({ value, children }: ToggleGroupItemProps) {
  const ctx = useToggleGroupContext('Item');
  const isOn = ctx.selectedValues.includes(value);
  const isFirst = ctx.claimFirstItem();

  return (
    <button
      type="button"
      data-togglegroup-item=""
      data-value={value}
      aria-pressed={isOn ? 'true' : 'false'}
      data-state={isOn ? 'on' : 'off'}
      disabled={ctx.disabled}
      aria-disabled={ctx.disabled ? 'true' : undefined}
      tabindex={isFirst ? '0' : '-1'}
      class={cn(ctx.classes?.item)}
      onClick={() => ctx.toggle(value)}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedToggleGroupProps {
  children?: ChildValue;
  classes?: ToggleGroupClasses;
  type?: 'single' | 'multiple';
  defaultValue?: string[];
  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
  onValueChange?: (value: string[]) => void;
}

function ComposedToggleGroupRoot({
  children,
  classes,
  type = 'single',
  defaultValue = [],
  orientation = 'horizontal',
  disabled = false,
  onValueChange,
}: ComposedToggleGroupProps) {
  let selectedValues = [...defaultValue];

  function toggle(itemValue: string): void {
    if (disabled) return;
    const current = [...selectedValues];
    const idx = current.indexOf(itemValue);

    if (type === 'single') {
      if (idx >= 0) {
        current.length = 0;
      } else {
        current.length = 0;
        current.push(itemValue);
      }
    } else {
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(itemValue);
      }
    }

    selectedValues = current;
    onValueChange?.(current);
  }

  // Track first item for roving tabindex initialization.
  // Use a plain object so the compiler won't transform this to a signal.
  const _state = { firstItemClaimed: false };

  const ctx: ToggleGroupContextValue = {
    selectedValues,
    classes,
    disabled,
    toggle,
    claimFirstItem: () => {
      if (_state.firstItemClaimed) return false;
      _state.firstItemClaimed = true;
      return true;
    },
  };

  return (
    <ToggleGroupContext.Provider value={ctx}>
      <div
        role="group"
        id={uniqueId('toggle-group')}
        data-orientation={orientation}
        data-togglegroup-root=""
        class={cn(classes?.root)}
        onKeydown={(event: KeyboardEvent) => {
          if (
            !isKey(
              event,
              Keys.ArrowLeft,
              Keys.ArrowRight,
              Keys.ArrowUp,
              Keys.ArrowDown,
              Keys.Home,
              Keys.End,
            )
          ) {
            return;
          }

          event.preventDefault();
          const root = event.currentTarget as HTMLElement;
          const items = [...root.querySelectorAll<HTMLElement>('[data-togglegroup-item]')];
          const currentIdx = items.indexOf(document.activeElement as HTMLElement);
          if (currentIdx < 0) return;

          const len = items.length;
          let nextIdx: number;

          if (isKey(event, Keys.ArrowRight, Keys.ArrowDown)) {
            nextIdx = (currentIdx + 1) % len;
          } else if (isKey(event, Keys.ArrowLeft, Keys.ArrowUp)) {
            nextIdx = (currentIdx - 1 + len) % len;
          } else if (isKey(event, Keys.Home)) {
            nextIdx = 0;
          } else if (isKey(event, Keys.End)) {
            nextIdx = len - 1;
          } else {
            return;
          }

          // Update roving tabindex
          items.forEach((el, j) => el.setAttribute('tabindex', j === nextIdx ? '0' : '-1'));
          items[nextIdx]?.focus();
        }}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedToggleGroup = Object.assign(ComposedToggleGroupRoot, {
  Item: ToggleGroupItem,
}) as ((props: ComposedToggleGroupProps) => HTMLElement) & {
  __classKeys?: ToggleGroupClassKey;
  Item: (props: ToggleGroupItemProps) => HTMLElement;
};
