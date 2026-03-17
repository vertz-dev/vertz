/**
 * Composed ToggleGroup — declarative JSX component with context-based registration
 * and class distribution. Builds on the same behavior as ToggleGroup.Root but in a
 * fully declarative structure.
 *
 * Supports single-select and multi-select modes with keyboard navigation.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, resolveChildren, useContext } from '@vertz/ui';
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
  /** @internal — registers an item for the toggle group */
  _registerItem: (value: string, content: ChildValue) => void;
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
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function ToggleGroupItem({ value, children: itemContent }: ToggleGroupItemProps) {
  const { _registerItem } = useToggleGroupContext('Item');
  _registerItem(value, itemContent);
  return (<span style="display: contents" />) as HTMLElement;
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
  // Collect item registrations
  const registrations: { value: string; content: ChildValue }[] = [];

  const ctxValue: ToggleGroupContextValue = {
    _registerItem: (value, content) => {
      registrations.push({ value, content });
    },
  };

  // Resolve children to collect registrations
  ToggleGroupContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // State
  let selectedValues = [...defaultValue];

  // Refs for keyboard navigation
  const itemRefs: Ref<HTMLButtonElement>[] = registrations.map(() => ref());

  function toggleValue(itemValue: string): void {
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

  // Build items
  const itemNodes = registrations.map((reg, i) => {
    const { value } = reg;
    const itemChildren = resolveChildren(reg.content);
    const isOn = selectedValues.includes(value);

    return (
      <button
        ref={itemRefs[i]}
        type="button"
        data-value={value}
        aria-pressed={isOn ? 'true' : 'false'}
        data-state={isOn ? 'on' : 'off'}
        disabled={disabled}
        aria-disabled={disabled ? 'true' : undefined}
        tabindex={i === 0 ? '0' : '-1'}
        class={classes?.item}
        onClick={() => toggleValue(value)}
      >
        {...itemChildren}
      </button>
    );
  });

  return (
    <div
      role="group"
      id={uniqueId('toggle-group')}
      data-orientation={orientation}
      class={classes?.root}
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
        const currentIdx = itemRefs.findIndex((r) => r.current === document.activeElement);
        if (currentIdx < 0) return;

        const len = itemRefs.length;
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
        for (let j = 0; j < len; j++) {
          const el = itemRefs[j]?.current;
          if (el) {
            el.setAttribute('tabindex', j === nextIdx ? '0' : '-1');
          }
        }
        itemRefs[nextIdx]?.current?.focus();
      }}
    >
      {itemNodes}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedToggleGroup = Object.assign(ComposedToggleGroupRoot, {
  Item: ToggleGroupItem,
}) as ((props: ComposedToggleGroupProps) => HTMLElement) & {
  __classKeys?: ToggleGroupClassKey;
  Item: (props: ToggleGroupItemProps) => HTMLElement;
};
