import type { SwitchElements, SwitchOptions, SwitchState } from '@vertz/ui-primitives';
import { Switch } from '@vertz/ui-primitives';

interface SwitchStyleClasses {
  readonly root: string;
  readonly rootSm: string;
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
    return result;
  };
}
