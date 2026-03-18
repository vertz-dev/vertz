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
  selectedValue: string;
  classes?: RadioGroupClasses;
  select: (value: string) => void;
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
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function RadioGroupItem({ value, disabled, children }: RadioGroupItemProps) {
  const ctx = useRadioGroupContext('Item');
  const isDisabled = disabled ?? false;

  return (
    <div
      style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"
      data-radiogroup-item=""
      data-value={value}
      onClick={() => {
        if (!isDisabled) ctx.select(value);
      }}
    >
      <div
        role="radio"
        aria-checked={ctx.selectedValue === value ? 'true' : 'false'}
        data-state={ctx.selectedValue === value ? 'checked' : 'unchecked'}
        tabindex={ctx.selectedValue === value ? '0' : '-1'}
        aria-disabled={isDisabled ? 'true' : undefined}
        class={ctx.classes?.item}
        style={isDisabled ? 'pointer-events: none; position: relative;' : 'position: relative;'}
      >
        <span
          data-part="indicator"
          data-state={ctx.selectedValue === value ? 'checked' : 'unchecked'}
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
    selectedValue,
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
          const root = (event.currentTarget as HTMLElement);
          const items = [...root.querySelectorAll<HTMLElement>('[data-radiogroup-item]')];
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
