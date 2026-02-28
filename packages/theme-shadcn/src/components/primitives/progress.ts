import type { ProgressElements, ProgressOptions, ProgressState } from '@vertz/ui-primitives';
import { Progress } from '@vertz/ui-primitives';

interface ProgressStyleClasses {
  readonly root: string;
  readonly indicator: string;
}

export function createThemedProgress(
  styles: ProgressStyleClasses,
): (
  options?: ProgressOptions,
) => ProgressElements & { state: ProgressState; setValue: (value: number) => void } {
  return function themedProgress(options?: ProgressOptions) {
    const result = Progress.Root(options);
    result.root.classList.add(styles.root);
    result.root.style.opacity = '1';
    result.indicator.classList.add(styles.indicator);
    return result;
  };
}
