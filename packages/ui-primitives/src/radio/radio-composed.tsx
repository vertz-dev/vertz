/**
 * Composed RadioGroup — declarative JSX component with slot scanning and class distribution.
 * Builds on the same behavior as Radio.Root but in a fully declarative structure.
 */

import type { ChildValue, Ref } from '@vertz/ui';
import { ref, resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
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
// Sub-component props
// ---------------------------------------------------------------------------

interface RadioGroupItemProps {
  value: string;
  disabled?: boolean;
  children?: ChildValue;
}

// ---------------------------------------------------------------------------
// Sub-components — structural slot markers (JSX)
// ---------------------------------------------------------------------------

function RadioGroupItem({ value, disabled, children }: RadioGroupItemProps) {
  return (
    <span
      data-slot="radiogroup-item"
      data-value={value}
      data-disabled={disabled ? 'true' : undefined}
      style="display: contents"
    >
      {children}
    </span>
  );
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
  const resolvedNodes = resolveChildren(children);
  const { slots } = scanSlots(resolvedNodes);
  const itemEntries = slots.get('radiogroup-item') ?? [];

  // Reactive state — compiler transforms `let` to signal
  let selectedValue = defaultValue;

  // Refs for keyboard navigation (focus management)
  const itemRefs: Ref<HTMLDivElement>[] = itemEntries.map(() => ref());
  const itemValues: string[] = itemEntries.map((e) => e.attrs.value ?? '');

  function selectItem(value: string, focusIdx?: number): void {
    selectedValue = value;
    if (focusIdx != null) itemRefs[focusIdx]?.current?.focus();
    onValueChange?.(value);
  }

  // Build items — inline signal refs so the compiler emits reactive __attr() calls.
  // Using intermediate `const isActive = value === selectedValue` would be cleaner,
  // but the compiler doesn't track derived consts as reactive inside .map() callbacks
  // yet (see #1342). Once that's fixed, this can be simplified.
  const itemNodes = itemEntries.map((entry, i) => {
    const value = entry.attrs.value ?? '';
    const isDisabled = 'disabled' in entry.attrs;
    const labelText = entry.children.map((n) => n.textContent ?? '').join('');

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

        let nextIdx = -1;
        if (isKey(event, Keys.ArrowDown, Keys.ArrowRight)) {
          event.preventDefault();
          nextIdx = (currentIdx + 1) % itemRefs.length;
        } else if (isKey(event, Keys.ArrowUp, Keys.ArrowLeft)) {
          event.preventDefault();
          nextIdx = (currentIdx - 1 + itemRefs.length) % itemRefs.length;
        }

        if (nextIdx >= 0) {
          const nextRef = itemRefs[nextIdx];
          if (nextRef?.current && !nextRef.current.hasAttribute('aria-disabled')) {
            selectItem(itemValues[nextIdx] ?? '', nextIdx);
          }
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
