/**
 * Composed RadioGroup — declarative JSX component with context-based registration
 * and class distribution. Builds on the same behavior as Radio.Root but in a fully
 * declarative structure.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { createContext, ref, resolveChildren, useContext } from '@vertz/ui';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface RadioGroupClasses {
  root?: string;
  item?: string;
  indicator?: string;
}

export type RadioGroupClassKey = keyof RadioGroupClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface RadioGroupContextValue {
  /** @internal — registers an item for the radio group */
  _registerItem: (value: string, disabled: boolean, labelText: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::RadioGroupContext',
);

function useRadioGroupContext(componentName: string): RadioGroupContextValue {
  const ctx = useContext(RadioGroupContext);
  if (!ctx) {
    throw new Error(
      `<RadioGroup.${componentName}> must be used inside <RadioGroup>. ` +
        'Ensure it is a direct or nested child of the RadioGroup root component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface RadioGroupItemProps {
  value: string;
  disabled?: boolean;
  children?: ChildValue;
}

// ---------------------------------------------------------------------------
// Sub-components — registration via context
// ---------------------------------------------------------------------------

function RadioGroupItem({ value, disabled, children }: RadioGroupItemProps) {
  const { _registerItem } = useRadioGroupContext('Item');

  // Resolve children to extract label text
  const resolved = resolveChildren(children);
  const labelText = resolved.map((n) => n.textContent ?? '').join('');

  _registerItem(value, disabled ?? false, labelText);

  return (<span style="display: contents" />) as HTMLElement;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedRadioGroupProps {
  children?: ChildValue;
  classes?: RadioGroupClasses;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

function ComposedRadioGroupRoot({
  children,
  classes,
  defaultValue = '',
  onValueChange,
}: ComposedRadioGroupProps) {
  // Collect item registrations
  const registrations: { value: string; disabled: boolean; labelText: string }[] = [];

  const ctxValue: RadioGroupContextValue = {
    _registerItem: (value, disabled, labelText) => {
      registrations.push({ value, disabled, labelText });
    },
  };

  // Resolve children to collect registrations
  RadioGroupContext.Provider(ctxValue, () => {
    resolveChildren(children);
  });

  // Reactive state — compiler transforms `let` to signal
  let selectedValue = defaultValue;

  // Refs for keyboard navigation (focus management)
  const itemRefs: Ref<HTMLDivElement>[] = registrations.map(() => ref());
  const itemValues: string[] = registrations.map((r) => r.value);

  function selectItem(value: string, focusIdx?: number): void {
    selectedValue = value;
    if (focusIdx != null) itemRefs[focusIdx]?.current?.focus();
    onValueChange?.(value);
  }

  // Build items — inline signal refs so the compiler emits reactive __attr() calls.
  // Using intermediate `const isActive = value === selectedValue` would be cleaner,
  // but the compiler doesn't track derived consts as reactive inside .map() callbacks
  // yet (see #1342). Once that's fixed, this can be simplified.
  const itemNodes = registrations.map((reg, i) => {
    const { value, disabled: isDisabled, labelText } = reg;

    return (
      <div
        ref={itemRefs[i]}
        role="radio"
        id={uniqueId('radio')}
        data-value={value}
        aria-checked={value === selectedValue ? 'true' : 'false'}
        data-state={value === selectedValue ? 'checked' : 'unchecked'}
        tabindex={value === selectedValue ? '0' : '-1'}
        aria-disabled={isDisabled ? 'true' : undefined}
        class={classes?.item}
        style={isDisabled ? 'pointer-events: none' : undefined}
        onClick={() => {
          if (!isDisabled) selectItem(value, i);
        }}
      >
        <span
          data-part="indicator"
          data-state={value === selectedValue ? 'checked' : 'unchecked'}
          class={classes?.indicator}
        />
        {labelText && <span>{labelText}</span>}
      </div>
    );
  });

  return (
    <div
      role="radiogroup"
      id={uniqueId('radiogroup')}
      class={classes?.root}
      onKeydown={(event: KeyboardEvent) => {
        const currentIdx = itemRefs.findIndex((r) => r.current === document.activeElement);
        if (currentIdx < 0) return;

        const len = itemRefs.length;
        let nextIdx = -1;

        if (isKey(event, Keys.ArrowDown, Keys.ArrowRight)) {
          event.preventDefault();
          nextIdx = (currentIdx + 1) % len;
        } else if (isKey(event, Keys.ArrowUp, Keys.ArrowLeft)) {
          event.preventDefault();
          nextIdx = (currentIdx - 1 + len) % len;
        } else if (isKey(event, Keys.Home)) {
          event.preventDefault();
          nextIdx = 0;
        } else if (isKey(event, Keys.End)) {
          event.preventDefault();
          nextIdx = len - 1;
        }

        if (nextIdx < 0) return;

        // Skip disabled items: scan forward for Home/ArrowDown/Right, backward for End/ArrowUp/Left
        const direction = isKey(event, Keys.End, Keys.ArrowUp, Keys.ArrowLeft) ? -1 : 1;
        const startIdx = nextIdx;
        while (registrations[nextIdx]?.disabled) {
          nextIdx = (nextIdx + direction + len) % len;
          if (nextIdx === startIdx) return; // all disabled
        }

        if (nextIdx !== currentIdx) {
          selectItem(itemValues[nextIdx] ?? '', nextIdx);
        }
      }}
    >
      {itemNodes}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedRadioGroup = Object.assign(ComposedRadioGroupRoot, {
  Item: RadioGroupItem,
}) as ((props: ComposedRadioGroupProps) => HTMLElement) & {
  __classKeys?: RadioGroupClassKey;
  Item: (props: RadioGroupItemProps) => HTMLElement;
};
