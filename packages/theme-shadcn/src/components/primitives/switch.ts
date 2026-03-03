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
    const root = Switch.Root(primitiveOptions);
    root.classList.add(size === 'sm' ? styles.rootSm : styles.root);
    // The primitive doesn't expose a thumb element — create one for visual styling
    const thumb = document.createElement('span');
    thumb.classList.add(size === 'sm' ? styles.thumbSm : styles.thumb);
    // Sync data-state to thumb so CSS can animate it
    const initialState = root.getAttribute('data-state') ?? 'unchecked';
    thumb.setAttribute('data-state', initialState);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-state') {
          const newState = root.getAttribute('data-state') ?? 'unchecked';
          thumb.setAttribute('data-state', newState);
        }
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-state'] });
    root.appendChild(thumb);
    return root;
  };
}
