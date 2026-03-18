/**
 * Composed Tabs — compound component with roving tabindex and ARIA.
 * Each sub-component renders its own DOM. Root provides shared state via context.
 * No registration, no resolveChildren, no internal API imports.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { uniqueId } from '../utils/id';
import { handleListNavigation } from '../utils/keyboard';

// ---------------------------------------------------------------------------
// Class types
// ---------------------------------------------------------------------------

export interface TabsClasses {
  list?: string;
  trigger?: string;
  panel?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TabsContextValue {
  activeValue: string;
  classes?: TabsClasses;
  orientation: 'horizontal' | 'vertical';
  select: (value: string) => void;
  getTriggerIdFor: (value: string) => string;
  getPanelIdFor: (value: string) => string;
}

const TabsContext = createContext<TabsContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::TabsContext',
);

function useTabsContext(componentName: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(
      `<Tabs.${componentName}> must be used inside <Tabs>. ` +
        'Ensure it is a direct or nested child of the Tabs root component.',
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface TriggerProps extends SlotProps {
  value: string;
}

interface ContentProps extends SlotProps {
  value: string;
}

// ---------------------------------------------------------------------------
// Sub-components — each renders its own DOM
// ---------------------------------------------------------------------------

function TabsList({ children, className: cls, class: classProp }: SlotProps) {
  const ctx = useTabsContext('List');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.list, effectiveCls].filter(Boolean).join(' ');

  return (
    <div
      role="tablist"
      data-tabs-list=""
      aria-orientation={ctx.orientation === 'vertical' ? 'vertical' : undefined}
      class={combined || undefined}
      onKeydown={(event: KeyboardEvent) => {
        const list = event.currentTarget as HTMLElement;
        const triggers = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
        const result = handleListNavigation(event, triggers, { orientation: ctx.orientation });
        if (result) {
          const value = result.getAttribute('data-value');
          if (value) ctx.select(value);
        }
      }}
    >
      {children}
    </div>
  );
}

function TabsTrigger({ value, children, className: cls, class: classProp }: TriggerProps) {
  const ctx = useTabsContext('Trigger');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.trigger, effectiveCls].filter(Boolean).join(' ');
  const isActive = ctx.activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      id={ctx.getTriggerIdFor(value)}
      data-tabs-trigger=""
      data-value={value}
      aria-controls={ctx.getPanelIdFor(value)}
      aria-selected={isActive ? 'true' : 'false'}
      data-state={isActive ? 'active' : 'inactive'}
      tabindex={isActive ? '0' : '-1'}
      class={combined || undefined}
      onClick={() => ctx.select(value)}
    >
      {children}
    </button>
  );
}

function TabsContent({ value, children, className: cls, class: classProp }: ContentProps) {
  const ctx = useTabsContext('Content');
  const effectiveCls = cls ?? classProp;
  const combined = [ctx.classes?.panel, effectiveCls].filter(Boolean).join(' ');
  const isActive = ctx.activeValue === value;

  return (
    <div
      role="tabpanel"
      id={ctx.getPanelIdFor(value)}
      data-tabs-panel=""
      data-value={value}
      aria-labelledby={ctx.getTriggerIdFor(value)}
      tabindex="0"
      aria-hidden={isActive ? 'false' : 'true'}
      data-state={isActive ? 'active' : 'inactive'}
      style={isActive ? '' : 'display: none'}
      class={combined || undefined}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedTabsProps {
  children?: ChildValue;
  classes?: TabsClasses;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
}

export type TabsClassKey = keyof TabsClasses;

function ComposedTabsRoot({
  children,
  classes,
  defaultValue = '',
  onValueChange,
  orientation = 'horizontal',
}: ComposedTabsProps) {
  const baseId = uniqueId('tabs');

  let activeValue = defaultValue;

  function select(value: string): void {
    activeValue = value;
    onValueChange?.(value);
  }

  // Stable ID generators — deterministic from value
  function getTriggerIdFor(value: string): string {
    return `${baseId}-trigger-${value}`;
  }

  function getPanelIdFor(value: string): string {
    return `${baseId}-panel-${value}`;
  }

  const ctx: TabsContextValue = {
    activeValue,
    classes,
    orientation,
    select,
    getTriggerIdFor,
    getPanelIdFor,
  };

  return (
    <TabsContext.Provider value={ctx}>
      <div data-tabs-root="">{children}</div>
    </TabsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ComposedTabs = Object.assign(ComposedTabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
}) as ((props: ComposedTabsProps) => HTMLElement) & {
  __classKeys?: TabsClassKey;
  List: (props: SlotProps) => HTMLElement;
  Trigger: (props: TriggerProps) => HTMLElement;
  Content: (props: ContentProps) => HTMLElement;
};
