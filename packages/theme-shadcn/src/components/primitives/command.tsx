import type { ChildValue } from '@vertz/ui';
import type { ComposedCommandProps } from '@vertz/ui-primitives';
import { ComposedCommand, withStyles } from '@vertz/ui-primitives';

interface CommandStyleClasses {
  readonly root: string;
  readonly input: string;
  readonly list: string;
  readonly item: string;
  readonly group: string;
  readonly groupHeading: string;
  readonly separator: string;
  readonly empty: string;
}

// ── Props ──────────────────────────────────────────────────

export interface CommandRootProps {
  filter?: (value: string, search: string) => boolean;
  onSelect?: (value: string) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  children?: ChildValue;
}

export interface CommandSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface CommandItemProps {
  value: string;
  children?: ChildValue;
  keywords?: string[];
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface CommandGroupProps {
  label: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedCommandComponent {
  (props: CommandRootProps): HTMLElement;
  Input: (props: CommandSlotProps) => HTMLElement;
  List: (props: CommandSlotProps) => HTMLElement;
  Empty: (props: CommandSlotProps) => HTMLElement;
  Item: (props: CommandItemProps) => HTMLElement;
  Group: (props: CommandGroupProps) => HTMLElement;
  Separator: (props: CommandSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedCommand(styles: CommandStyleClasses): ThemedCommandComponent {
  const Styled = withStyles(ComposedCommand, {
    root: styles.root,
    input: styles.input,
    list: styles.list,
    item: styles.item,
    group: styles.group,
    groupHeading: styles.groupHeading,
    separator: styles.separator,
    empty: styles.empty,
  });

  function CommandRoot({
    children,
    filter,
    onSelect,
    onInputChange,
    placeholder,
  }: CommandRootProps): HTMLElement {
    return Styled({
      children,
      filter,
      onSelect,
      onInputChange,
      placeholder,
    } as ComposedCommandProps);
  }

  return Object.assign(CommandRoot, {
    Input: ComposedCommand.Input,
    List: ComposedCommand.List,
    Empty: ComposedCommand.Empty,
    Item: ComposedCommand.Item,
    Group: ComposedCommand.Group,
    Separator: ComposedCommand.Separator,
  }) as ThemedCommandComponent;
}
