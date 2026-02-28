import type { SwitchElements, SwitchOptions, SwitchState } from '@vertz/ui-primitives';
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
): (options?: ThemedSwitchOptions) => SwitchElements & { state: SwitchState } {
  return function themedSwitch(options?: ThemedSwitchOptions) {
    const { size, ...primitiveOptions } = options ?? {};
    const result = Switch.Root(primitiveOptions);
    result.root.classList.add(size === 'sm' ? styles.rootSm : styles.root);
    // The primitive doesn't expose a thumb element — create one for visual styling
    const thumb = document.createElement('span');
    thumb.classList.add(size === 'sm' ? styles.thumbSm : styles.thumb);
    // Sync data-state to thumb so CSS can animate it
    const initialState = result.root.getAttribute('data-state') ?? 'unchecked';
    thumb.setAttribute('data-state', initialState);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-state') {
          const newState = result.root.getAttribute('data-state') ?? 'unchecked';
          thumb.setAttribute('data-state', newState);
        }
      }
    });
    observer.observe(result.root, { attributes: true, attributeFilter: ['data-state'] });
    result.root.appendChild(thumb);
    return result;
  };
}
