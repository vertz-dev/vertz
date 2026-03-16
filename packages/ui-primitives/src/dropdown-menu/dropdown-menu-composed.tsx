/**
 * Composed DropdownMenu — high-level composable component built on Menu.Root.
 * Sub-components self-wire via context. No slot scanning.
 * Uses context override for groups: Group provides a sub-context where
 * _createItem delegates to group.Item() instead of menu.Item().
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, resolveChildren, useContext } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { Menu } from '../menu/menu';
import type { FloatingOptions } from '../utils/floating';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface DropdownMenuClasses {
  content?: string;
  item?: string;
  group?: string;
  label?: string;
  separator?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DropdownMenuContextValue {
  menu: ReturnType<typeof Menu.Root>;
  classes?: DropdownMenuClasses;
  /** @internal — registers the user trigger for ARIA sync */
  _registerTrigger: (el: HTMLElement) => void;
  /** Factory to create an item — overridden by Group sub-context */
  _createItem: (value: string, label?: string) => HTMLDivElement;
  /** @internal — duplicate sub-component detection */
  _triggerClaimed: boolean;
  _contentClaimed: boolean;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::DropdownMenuContext',
);

function useDropdownMenuContext(componentName: string): DropdownMenuContextValue {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx) {
    throw new Error(
      `<DropdownMenu.${componentName}> must be used inside <DropdownMenu>. ` +
        'Ensure it is a direct or nested child of the DropdownMenu root component.',
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

interface ItemProps extends SlotProps {
  value: string;
}

interface GroupProps extends SlotProps {
  label: string;
}

// ---------------------------------------------------------------------------
// Sub-components — self-wiring via context
// ---------------------------------------------------------------------------

function MenuTrigger({ children }: SlotProps) {
  const ctx = useDropdownMenuContext('Trigger');
  if (ctx._triggerClaimed) {
    console.warn('Duplicate <DropdownMenu.Trigger> detected – only the first is used');
  }
  ctx._triggerClaimed = true;
  const { menu, _registerTrigger } = ctx;

  // Resolve children to find the user's trigger element
  const resolved = resolveChildren(children);
  const userTrigger = resolved.find((n): n is HTMLElement => n instanceof HTMLElement) ?? null;

  if (userTrigger) {
    // Wire ARIA attributes on the user's element
    userTrigger.setAttribute('aria-haspopup', 'menu');
    userTrigger.setAttribute('aria-controls', menu.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    // Delegate click to the primitive's trigger
    const handleClick = () => {
      menu.trigger.click();
    };
    userTrigger.addEventListener('click', handleClick);
    _tryOnCleanup(() => userTrigger.removeEventListener('click', handleClick));

    // Register for ARIA sync on state changes
    _registerTrigger(userTrigger);
  }

  return (<span style="display: contents">{...resolved}</span>) as HTMLElement;
}

function MenuContent({ children }: SlotProps) {
  const ctx = useDropdownMenuContext('Content');
  if (ctx._contentClaimed) {
    console.warn('Duplicate <DropdownMenu.Content> detected – only the first is used');
  }
  ctx._contentClaimed = true;
  const { menu } = ctx;

  // Resolve children (Items, Groups, Labels, Separators) for registration side effects
  resolveChildren(children);

  return menu.content;
}

function MenuItem({ value, children, className: cls, class: classProp }: ItemProps) {
  const { _createItem, classes } = useDropdownMenuContext('Item');
  const effectiveCls = cls ?? classProp;

  // Extract label from children
  const resolved = resolveChildren(children);
  const label = resolved
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();

  const item = _createItem(value, label || undefined);

  // Apply item class
  const itemClass = [classes?.item, effectiveCls].filter(Boolean).join(' ');
  if (itemClass) item.className = itemClass;

  return item;
}

function MenuGroup({ label, children }: GroupProps) {
  const ctx = useDropdownMenuContext('Group');
  const group = ctx.menu.Group(label);

  if (ctx.classes?.group) group.el.className = ctx.classes.group;

  // Override _createItem in sub-context so nested Items use group.Item()
  DropdownMenuContext.Provider({ ...ctx, _createItem: (v, l) => group.Item(v, l) }, () => {
    resolveChildren(children);
  });

  return group.el;
}

function MenuLabel({ children, className: cls, class: classProp }: SlotProps) {
  const { menu, classes } = useDropdownMenuContext('Label');
  const effectiveCls = cls ?? classProp;

  // Extract text from children
  const resolved = resolveChildren(children);
  const text = resolved
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();

  const labelEl = menu.Label(text);

  // Apply label class
  const labelClass = [classes?.label, effectiveCls].filter(Boolean).join(' ');
  if (labelClass) labelEl.className = labelClass;

  return labelEl;
}

function MenuSeparator(_props: SlotProps) {
  const { menu, classes } = useDropdownMenuContext('Separator');
  const sep = menu.Separator();
  if (classes?.separator) sep.className = classes.separator;
  return sep;
}

// ---------------------------------------------------------------------------
// Root composed component
// ---------------------------------------------------------------------------

export interface ComposedDropdownMenuProps {
  children?: ChildValue;
  classes?: DropdownMenuClasses;
  onSelect?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
}

export type DropdownMenuClassKey = keyof DropdownMenuClasses;

function ComposedDropdownMenuRoot({
  children,
  classes,
  onSelect,
  onOpenChange,
  positioning,
}: ComposedDropdownMenuProps) {
  // Track the user's trigger element for ARIA sync
  let userTrigger: HTMLElement | null = null;

  // Create the low-level menu primitive with ARIA sync
  const menu = Menu.Root({
    onSelect,
    positioning,
    onOpenChange: (isOpen) => {
      if (userTrigger) {
        userTrigger.setAttribute('aria-expanded', String(isOpen));
        userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
      }
      onOpenChange?.(isOpen);
    },
  });

  // Apply content class
  if (classes?.content) {
    menu.content.className = classes.content;
  }

  const ctxValue: DropdownMenuContextValue = {
    menu,
    classes,
    _registerTrigger: (el: HTMLElement) => {
      userTrigger = el;
    },
    _createItem: (value, label) => menu.Item(value, label),
    _triggerClaimed: false,
    _contentClaimed: false,
  };

  // Resolve children for registration side effects
  let resolvedNodes: Node[] = [];
  DropdownMenuContext.Provider(ctxValue, () => {
    resolvedNodes = resolveChildren(children);
  });

  return (
    <div style="display: contents">
      {...resolvedNodes}
      {menu.content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedDropdownMenu = Object.assign(ComposedDropdownMenuRoot, {
  Trigger: MenuTrigger,
  Content: MenuContent,
  Item: MenuItem,
  Group: MenuGroup,
  Label: MenuLabel,
  Separator: MenuSeparator,
}) as ((props: ComposedDropdownMenuProps) => HTMLElement) & {
  __classKeys?: DropdownMenuClassKey;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Item: (props: ItemProps) => HTMLElement;
  Group: (props: GroupProps) => HTMLElement;
  Label: (props: SlotProps) => HTMLElement;
  Separator: (props: SlotProps) => HTMLElement;
};
