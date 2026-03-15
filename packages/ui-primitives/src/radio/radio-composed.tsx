/**
 * Composed RadioGroup — high-level composable component built on Radio.Root.
 * Uses slot scanning for RadioGroup.Item sub-components.
 */

import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import { scanSlots } from '../composed/scan-slots';
import { Radio } from './radio';

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
// Sub-components — structural slot markers
// ---------------------------------------------------------------------------

function RadioGroupItem({ value, disabled, children }: RadioGroupItemProps) {
  const el = document.createElement('span');
  el.setAttribute('data-slot', 'radiogroup-item');
  el.setAttribute('data-value', value);
  if (disabled) el.setAttribute('data-disabled', 'true');
  el.style.display = 'contents';

  if (children) {
    const resolved = resolveChildren(children);
    for (const node of resolved) {
      el.appendChild(node);
    }
  }

  return el;
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
  defaultValue,
  onValueChange,
}: ComposedRadioGroupProps) {
  // Track indicators for state sync
  const indicators = new Map<string, HTMLSpanElement>();

  // Resolve children for slot scanning
  const resolvedNodes = resolveChildren(children);

  // Scan for item slots
  const { slots } = scanSlots(resolvedNodes);
  const itemEntries = slots.get('radiogroup-item') ?? [];

  // Create the low-level radio primitive
  const radio = Radio.Root({
    defaultValue,
    onValueChange: (value) => {
      for (const [itemValue, indicator] of indicators) {
        indicator.setAttribute('data-state', itemValue === value ? 'checked' : 'unchecked');
      }
      onValueChange?.(value);
    },
  });

  // Bridge: for each scanned slot, call the primitive's Item()
  for (const entry of itemEntries) {
    const value = entry.attrs.value ?? '';
    const isDisabled = 'disabled' in entry.attrs;
    const labelText = entry.children.map((n) => n.textContent ?? '').join('');

    // Create the primitive radio item
    const item = radio.Item(value, labelText);

    // Apply item class
    if (classes?.item) item.classList.add(classes.item);

    // Handle disabled
    if (isDisabled) {
      item.setAttribute('aria-disabled', 'true');
      item.style.pointerEvents = 'none';
    }

    // Create indicator
    const indicator = document.createElement('span');
    indicator.setAttribute('data-part', 'indicator');
    const dataState = item.getAttribute('data-state') ?? 'unchecked';
    indicator.setAttribute('data-state', dataState);
    if (classes?.indicator) indicator.className = classes.indicator;
    indicators.set(value, indicator);

    // Clear text, add indicator, then label
    item.textContent = '';
    item.appendChild(indicator);

    if (labelText) {
      const labelEl = document.createElement('span');
      labelEl.textContent = labelText;
      item.appendChild(labelEl);
    }
  }

  // Apply root class
  if (classes?.root) radio.root.className = classes.root;

  return radio.root;
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
