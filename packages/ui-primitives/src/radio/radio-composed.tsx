/**
 * Composed RadioGroup — compound component where each Item renders its own DOM.
 * Root provides shared state via context. No registration, no resolveChildren.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface RadioGroupClasses {
  root?: string;
  item?: string;
  indicator?: string;
  indicatorIcon?: string;
}

export type RadioGroupClassKey = keyof RadioGroupClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface RadioGroupContextValue {
  /** Function getter to avoid static signal capture in context. */
  isSelected: (value: string) => boolean;
  classes?: RadioGroupClasses;
  select: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::RadioGroupContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface RadioGroupItemProps {
  value: string;
  disabled?: boolean;
  children?: ChildValue;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function RadioGroupItem({ value, disabled, children }: RadioGroupItemProps) {
  // Use useContext() directly so the compiler recognizes ctx as reactive,
  // wrapping derived const variables in computed() → reactive __attr.
  const ctx = useContext(RadioGroupContext);
  if (!ctx) {
    throw new Error(
      '<RadioGroup.Item> must be used inside <RadioGroup>. ' +
        'Ensure it is a direct or nested child of the RadioGroup root component.',
    );
  }
  const isDisabled = disabled ?? false;
  const isChecked = ctx.isSelected(value);

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
      data-radiogroup-item=""
      onClick={() => {
        if (!isDisabled) ctx.select(value);
      }}
    >
      <div
        role="radio"
        data-value={value}
        aria-checked={isChecked ? 'true' : 'false'}
        data-state={isChecked ? 'checked' : 'unchecked'}
        tabindex={isChecked ? '0' : '-1'}
        aria-disabled={isDisabled ? 'true' : undefined}
        class={ctx.classes?.item}
        style={{ pointerEvents: isDisabled ? 'none' : undefined, position: 'relative' }}
      >
        <span
          data-part="indicator"
          data-state={isChecked ? 'checked' : 'unchecked'}
          class={ctx.classes?.indicator}
        >
          <span data-part="indicator-icon" class={ctx.classes?.indicatorIcon} />
        </span>
      </div>
      {children && <span>{children}</span>}
    </div>
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
  let selectedValue = defaultValue;

  function select(value: string): void {
    selectedValue = value;
    onValueChange?.(value);
  }

  const ctx: RadioGroupContextValue = {
    isSelected: (value: string) => selectedValue === value,
    classes,
    select,
  };

  return (
    <RadioGroupContext.Provider value={ctx}>
      <div
        role="radiogroup"
        id={uniqueId('radiogroup')}
        class={classes?.root}
        data-radiogroup-root=""
        onKeydown={(event: KeyboardEvent) => {
          const root = event.currentTarget as HTMLElement;
          const items = [...root.querySelectorAll<HTMLElement>('[role="radio"]')];
          const currentIdx = items.indexOf(document.activeElement as HTMLElement);
          if (currentIdx < 0) return;

          const len = items.length;
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

          // Skip disabled items
          const direction = isKey(event, Keys.End, Keys.ArrowUp, Keys.ArrowLeft) ? -1 : 1;
          const startIdx = nextIdx;
          while (items[nextIdx]?.getAttribute('aria-disabled') === 'true') {
            nextIdx = (nextIdx + direction + len) % len;
            if (nextIdx === startIdx) return; // all disabled
          }

          const nextValue = items[nextIdx]?.getAttribute('data-value');
          if (nextValue != null) {
            select(nextValue);
            items[nextIdx]?.focus();
          }
        }}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedRadioGroup = Object.assign(ComposedRadioGroupRoot, {
  Item: RadioGroupItem,
}) as ((props: ComposedRadioGroupProps) => HTMLElement) & {
  __classKeys?: RadioGroupClassKey;
  Item: (props: RadioGroupItemProps) => HTMLElement;
};
