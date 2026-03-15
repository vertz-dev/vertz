/**
 * Composed Switch — high-level composable component built on Switch.Root.
 * Applies classes to root button and thumb child.
 */

import type { ChildValue } from '@vertz/ui';
import { Switch } from './switch';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface SwitchClasses {
  root?: string;
  thumb?: string;
}

export type SwitchClassKey = keyof SwitchClasses;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ComposedSwitchProps {
  children?: ChildValue;
  classes?: SwitchClasses;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

function ComposedSwitchRoot({
  classes,
  defaultChecked,
  disabled,
  onCheckedChange,
}: ComposedSwitchProps) {
  const thumb = document.createElement('span');
  thumb.setAttribute('data-part', 'thumb');
  const initialState = defaultChecked ? 'checked' : 'unchecked';
  thumb.setAttribute('data-state', initialState);
  if (classes?.thumb) thumb.className = classes.thumb;

  const root = Switch.Root({
    defaultChecked,
    disabled,
    onCheckedChange: (checked) => {
      thumb.setAttribute('data-state', checked ? 'checked' : 'unchecked');
      onCheckedChange?.(checked);
    },
  });

  if (classes?.root) root.className = classes.root;
  root.appendChild(thumb);

  return root;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedSwitch = ComposedSwitchRoot as ((
  props: ComposedSwitchProps,
) => HTMLElement) & {
  __classKeys?: SwitchClassKey;
};
