import type { SwitchElements, SwitchOptions, SwitchState } from '@vertz/ui-primitives';
import { Switch } from '@vertz/ui-primitives';

interface SwitchStyleClasses {
  readonly root: string;
}

export function createThemedSwitch(
  styles: SwitchStyleClasses,
): (options?: SwitchOptions) => SwitchElements & { state: SwitchState } {
  return function themedSwitch(options?: SwitchOptions) {
    const result = Switch.Root(options);
    result.root.classList.add(styles.root);
    return result;
  };
}
