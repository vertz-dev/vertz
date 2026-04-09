import type { ChildValue } from '@vertz/ui';
import { ComposedTabs, withStyles } from '@vertz/ui-primitives';

interface TabsStyleClasses {
  readonly list: string;
  readonly trigger: string;
  readonly panel: string;
  readonly listLine: string;
  readonly triggerLine: string;
}

// ── Props ──────────────────────────────────────────────────

export interface TabsRootProps {
  defaultValue?: string;
  variant?: 'default' | 'line';
  children?: ChildValue;
}

export interface TabsSlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface TabsTriggerProps {
  value: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface TabsContentProps {
  value: string;
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedTabsComponent {
  (props: TabsRootProps): HTMLElement;
  List: (props: TabsSlotProps) => HTMLElement;
  Trigger: (props: TabsTriggerProps) => HTMLElement;
  Content: (props: TabsContentProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedTabs(styles: TabsStyleClasses): ThemedTabsComponent {
  // Pre-build both styled variants
  const DefaultTabs = withStyles(ComposedTabs, {
    list: styles.list,
    trigger: styles.trigger,
    panel: styles.panel,
  });

  const LineTabs = withStyles(ComposedTabs, {
    list: styles.listLine,
    trigger: styles.triggerLine,
    panel: styles.panel,
  });

  function TabsRoot({ defaultValue, variant, children }: TabsRootProps): HTMLElement {
    const Styled = variant === 'line' ? LineTabs : DefaultTabs;
    return (<Styled defaultValue={defaultValue}>{children}</Styled>) as HTMLElement;
  }

  return Object.assign(TabsRoot, {
    List: ComposedTabs.List,
    Trigger: ComposedTabs.Trigger,
    Content: ComposedTabs.Content,
  });
}
