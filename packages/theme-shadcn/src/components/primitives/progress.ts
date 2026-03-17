import type { ChildValue } from '@vertz/ui';
import { ComposedProgress } from '@vertz/ui-primitives';

interface ProgressStyleClasses {
  readonly root: string;
  readonly indicator: string;
}

// ── Props ──────────────────────────────────────────────────

export interface ProgressRootProps {
  children?: ChildValue;
  defaultValue?: number;
  min?: number;
  max?: number;
}

// ── Component type ─────────────────────────────────────────

export type ThemedProgressComponent = (props: ProgressRootProps) => HTMLElement;

// ── Factory ────────────────────────────────────────────────

export function createThemedProgress(styles: ProgressStyleClasses): ThemedProgressComponent {
  return function ProgressRoot(props: ProgressRootProps): HTMLElement {
    return ComposedProgress({
      ...props,
      classes: { root: styles.root, indicator: styles.indicator },
    });
  };
}
