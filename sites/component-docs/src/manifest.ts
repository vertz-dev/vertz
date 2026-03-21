export interface ComponentEntry {
  /** URL slug: 'button' */
  name: string;
  /** Display name: 'Button' */
  title: string;
  /** Sidebar group: 'Form' */
  category: string;
}

/**
 * All documented components, ordered by category then alphabetically.
 * Drives the sidebar, routing, SSG expansion, and Previous/Next navigation.
 */
export const components: ComponentEntry[] = [
  // ── Form ──────────────────────────────────────────────────
  { name: 'button', title: 'Button', category: 'Form' },
  { name: 'checkbox', title: 'Checkbox', category: 'Form' },
  { name: 'date-picker', title: 'DatePicker', category: 'Form' },
  { name: 'form-group', title: 'FormGroup', category: 'Form' },
  { name: 'input', title: 'Input', category: 'Form' },
  { name: 'label', title: 'Label', category: 'Form' },
  { name: 'radio-group', title: 'RadioGroup', category: 'Form' },
  { name: 'select', title: 'Select', category: 'Form' },
  { name: 'slider', title: 'Slider', category: 'Form' },
  { name: 'switch', title: 'Switch', category: 'Form' },
  { name: 'textarea', title: 'Textarea', category: 'Form' },
  { name: 'toggle', title: 'Toggle', category: 'Form' },

  // ── Layout ────────────────────────────────────────────────
  { name: 'card', title: 'Card', category: 'Layout' },
  { name: 'resizable-panel', title: 'ResizablePanel', category: 'Layout' },
  { name: 'scroll-area', title: 'ScrollArea', category: 'Layout' },
  { name: 'separator', title: 'Separator', category: 'Layout' },
  { name: 'skeleton', title: 'Skeleton', category: 'Layout' },
  { name: 'table', title: 'Table', category: 'Layout' },

  // ── Data Display ──────────────────────────────────────────
  { name: 'avatar', title: 'Avatar', category: 'Data Display' },
  { name: 'badge', title: 'Badge', category: 'Data Display' },
  { name: 'calendar', title: 'Calendar', category: 'Data Display' },
  { name: 'progress', title: 'Progress', category: 'Data Display' },

  // ── Feedback ──────────────────────────────────────────────
  { name: 'alert', title: 'Alert', category: 'Feedback' },
  { name: 'alert-dialog', title: 'AlertDialog', category: 'Feedback' },
  { name: 'dialog', title: 'Dialog', category: 'Feedback' },
  { name: 'dialog-stack', title: 'DialogStack', category: 'Feedback' },
  { name: 'drawer', title: 'Drawer', category: 'Feedback' },
  { name: 'sheet', title: 'Sheet', category: 'Feedback' },
  { name: 'toast', title: 'Toast', category: 'Feedback' },

  // ── Navigation ────────────────────────────────────────────
  { name: 'breadcrumb', title: 'Breadcrumb', category: 'Navigation' },
  { name: 'command', title: 'Command', category: 'Navigation' },
  { name: 'menubar', title: 'Menubar', category: 'Navigation' },
  { name: 'navigation-menu', title: 'NavigationMenu', category: 'Navigation' },
  { name: 'pagination', title: 'Pagination', category: 'Navigation' },
  { name: 'tabs', title: 'Tabs', category: 'Navigation' },

  // ── Overlay ───────────────────────────────────────────────
  { name: 'context-menu', title: 'ContextMenu', category: 'Overlay' },
  { name: 'dropdown-menu', title: 'DropdownMenu', category: 'Overlay' },
  { name: 'hover-card', title: 'HoverCard', category: 'Overlay' },
  { name: 'popover', title: 'Popover', category: 'Overlay' },
  { name: 'tooltip', title: 'Tooltip', category: 'Overlay' },

  // ── Disclosure ────────────────────────────────────────────
  { name: 'accordion', title: 'Accordion', category: 'Disclosure' },
  { name: 'carousel', title: 'Carousel', category: 'Disclosure' },
  { name: 'collapsible', title: 'Collapsible', category: 'Disclosure' },
  { name: 'toggle-group', title: 'ToggleGroup', category: 'Disclosure' },
];

/** Category display order for the sidebar. */
export const categoryOrder = [
  'Form',
  'Layout',
  'Data Display',
  'Feedback',
  'Navigation',
  'Overlay',
  'Disclosure',
] as const;

/** Get components grouped by category, respecting category order. */
export function getComponentsByCategory(): Map<string, ComponentEntry[]> {
  const grouped = new Map<string, ComponentEntry[]>();
  for (const cat of categoryOrder) {
    grouped.set(cat, []);
  }
  for (const entry of components) {
    const list = grouped.get(entry.category);
    if (list) {
      list.push(entry);
    }
  }
  return grouped;
}

/** Find a component entry by its URL slug. */
export function findComponent(name: string): ComponentEntry | undefined {
  return components.find((c) => c.name === name);
}

/** Get previous and next components for navigation. */
export function getAdjacentComponents(name: string): {
  prev: ComponentEntry | undefined;
  next: ComponentEntry | undefined;
} {
  const idx = components.findIndex((c) => c.name === name);
  if (idx === -1) return { prev: undefined, next: undefined };
  return {
    prev: idx > 0 ? components[idx - 1] : undefined,
    next: idx < components.length - 1 ? components[idx + 1] : undefined,
  };
}
