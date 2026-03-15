import type { SwitchOptions } from '@vertz/ui-primitives';
import { Switch } from '@vertz/ui-primitives';

interface SwitchStyleClasses {
  readonly root: string;
  readonly thumb: string;
  readonly rootSm: string;
  readonly thumbSm: string;
}

export interface ThemedSwitchOptions extends SwitchOptions {
  size?: 'default' | 'sm';
}

export function createThemedSwitch(
  styles: SwitchStyleClasses,
): (options?: ThemedSwitchOptions) => HTMLElement {
  return function themedSwitch(options?: ThemedSwitchOptions) {
    const { size, ...primitiveOptions } = options ?? {};
    // Create thumb first so we can reference it in the callback
    const thumb = document.createElement('span');
    thumb.classList.add(size === 'sm' ? styles.thumbSm : styles.thumb);

    const root = Switch.Root({
      ...primitiveOptions,
      onCheckedChange: (checked) => {
        thumb.setAttribute('data-state', checked ? 'checked' : 'unchecked');
        primitiveOptions.onCheckedChange?.(checked);
      },
    });
    root.classList.add(size === 'sm' ? styles.rootSm : styles.root);
    // Sync data-state to thumb so CSS can animate it
    const initialState = root.getAttribute('data-state') ?? 'unchecked';
    thumb.setAttribute('data-state', initialState);
    root.appendChild(thumb);
    return root;
  };
}
