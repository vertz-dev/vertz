import type { ChildValue } from '@vertz/ui';
import { ComposedSwitch, withStyles } from '@vertz/ui-primitives';

interface SwitchStyleClasses {
  readonly root: string;
  readonly thumb: string;
  readonly rootSm: string;
  readonly thumbSm: string;
}

// ── Props ──────────────────────────────────────────────────

export interface ThemedSwitchProps {
  children?: ChildValue;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: 'default' | 'sm';
}

// ── Component type ─────────────────────────────────────────

export type ThemedSwitchComponent = (props: ThemedSwitchProps) => HTMLElement;

// ── Factory ────────────────────────────────────────────────

export function createThemedSwitch(styles: SwitchStyleClasses): ThemedSwitchComponent {
  const DefaultSwitch = withStyles(ComposedSwitch, {
    root: styles.root,
    thumb: styles.thumb,
  });

  const SmSwitch = withStyles(ComposedSwitch, {
    root: styles.rootSm,
    thumb: styles.thumbSm,
  });

  return function SwitchRoot({ size, ...props }: ThemedSwitchProps): HTMLElement {
    const Styled = size === 'sm' ? SmSwitch : DefaultSwitch;
    return Styled(props);
  };
}
