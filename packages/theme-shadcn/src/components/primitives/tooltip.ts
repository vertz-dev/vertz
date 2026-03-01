import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { TooltipOptions } from '@vertz/ui-primitives';
import { Tooltip } from '@vertz/ui-primitives';

interface TooltipStyleClasses {
  readonly content: string;
}

// ── Props ──────────────────────────────────────────────────

export interface TooltipRootProps extends TooltipOptions {
  children?: ChildValue;
}

export interface TooltipSlotProps {
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedTooltipComponent {
  (props: TooltipRootProps): HTMLElement;
  Trigger: (props: TooltipSlotProps) => HTMLElement;
  Content: (props: TooltipSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedTooltip(styles: TooltipStyleClasses): ThemedTooltipComponent {
  function TooltipTrigger({ children }: TooltipSlotProps): HTMLElement {
    const el = document.createElement('span');
    el.dataset.slot = 'tooltip-trigger';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function TooltipContent({ children, class: className }: TooltipSlotProps): HTMLElement {
    const el = document.createElement('div');
    el.dataset.slot = 'tooltip-content';
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function TooltipRoot({ children, ...options }: TooltipRootProps): HTMLElement {
    let triggerChildren: Node[] = [];
    let contentChildren: Node[] = [];

    for (const node of resolveChildren(children)) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;
      if (slot === 'tooltip-trigger') {
        triggerChildren = Array.from(node.childNodes);
      } else if (slot === 'tooltip-content') {
        contentChildren = Array.from(node.childNodes);
      }
    }

    const primitive = Tooltip.Root({
      ...options,
      positioning: { placement: 'top', portal: true },
    });

    // Apply theme class
    primitive.content.classList.add(styles.content);

    // Move user's trigger children into the primitive trigger (span with hover/focus events)
    for (const node of triggerChildren) {
      primitive.trigger.appendChild(node);
    }

    // Move content children into the primitive's content
    for (const node of contentChildren) {
      primitive.content.appendChild(node);
    }

    return primitive.trigger;
  }

  TooltipRoot.Trigger = TooltipTrigger;
  TooltipRoot.Content = TooltipContent;

  return TooltipRoot as ThemedTooltipComponent;
}
