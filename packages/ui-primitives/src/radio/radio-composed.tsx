/**
 * Composed RadioGroup — declarative JSX component with slot scanning and class distribution.
 * Builds on the same behavior as Radio.Root but in a fully declarative structure.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
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
  // Resolve children for slot scanning
  const resolvedNodes = resolveChildren(children);
  const { slots } = scanSlots(resolvedNodes);
  const itemEntries = slots.get('radiogroup-item') ?? [];

  // State + item tracking
  let selectedValue = defaultValue;
  const itemEls: HTMLDivElement[] = [];

  function selectItem(value: string, focusEl?: HTMLElement): void {
    selectedValue = value;
    // Update all items
    for (const el of itemEls) {
      const itemValue = el.getAttribute('data-value') ?? '';
      const isActive = itemValue === value;
      el.setAttribute('aria-checked', isActive ? 'true' : 'false');
      el.setAttribute('data-state', isActive ? 'checked' : 'unchecked');
      el.setAttribute('tabindex', isActive ? '0' : '-1');
      // Update indicator
      const indicator = el.querySelector('[data-part="indicator"]');
      if (indicator) {
        indicator.setAttribute('data-state', isActive ? 'checked' : 'unchecked');
      }
    }
    if (focusEl) focusEl.focus();
    onValueChange?.(value);
  }

  // Build item elements from scanned slots
  const itemNodes = itemEntries.map((entry) => {
    const value = entry.attrs.value ?? '';
    const isDisabled = 'disabled' in entry.attrs;
    const labelText = entry.children.map((n) => n.textContent ?? '').join('');
    const isActive = value === selectedValue;

    const item = (
      <div
        role="radio"
        id={uniqueId('radio')}
        data-value={value}
        aria-checked={isActive ? 'true' : 'false'}
        data-state={isActive ? 'checked' : 'unchecked'}
        tabindex={isActive ? '0' : '-1'}
        aria-disabled={isDisabled ? 'true' : undefined}
        class={classes?.item}
        style={isDisabled ? 'pointer-events: none' : undefined}
        onClick={() => {
          if (!isDisabled) selectItem(value, item);
        }}
      >
        <span
          data-part="indicator"
          data-state={isActive ? 'checked' : 'unchecked'}
          class={classes?.indicator}
        />
        {labelText && <span>{labelText}</span>}
      </div>
    ) as HTMLDivElement;

    itemEls.push(item);
    return item;
  });

  return (
    <div
      role="radiogroup"
      id={uniqueId('radiogroup')}
      class={classes?.root}
      onKeydown={(event: KeyboardEvent) => {
        const currentIdx = itemEls.findIndex((el) => el === document.activeElement);
        if (currentIdx < 0) return;

        let nextIdx = -1;
        if (isKey(event, Keys.ArrowDown, Keys.ArrowRight)) {
          event.preventDefault();
          nextIdx = (currentIdx + 1) % itemEls.length;
        } else if (isKey(event, Keys.ArrowUp, Keys.ArrowLeft)) {
          event.preventDefault();
          nextIdx = (currentIdx - 1 + itemEls.length) % itemEls.length;
        }

        if (nextIdx >= 0) {
          const nextEl = itemEls[nextIdx];
          const nextValue = nextEl?.getAttribute('data-value') ?? '';
          if (nextEl && !nextEl.hasAttribute('aria-disabled')) {
            selectItem(nextValue, nextEl);
          }
        }
      }}
    >
      {itemNodes}
    </div>
  ) as HTMLDivElement;
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
