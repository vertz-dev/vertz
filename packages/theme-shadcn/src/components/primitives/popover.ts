import type { ChildValue } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { PopoverOptions } from '@vertz/ui-primitives';
import { Popover } from '@vertz/ui-primitives';

interface PopoverStyleClasses {
  readonly content: string;
}

// ── Props ──────────────────────────────────────────────────

export interface PopoverRootProps extends PopoverOptions {
  children?: ChildValue;
}

export interface PopoverSlotProps {
  children?: ChildValue;
  class?: string;
}

// ── Component type ─────────────────────────────────────────

export interface ThemedPopoverComponent {
  (props: PopoverRootProps): HTMLElement;
  Trigger: (props: PopoverSlotProps) => HTMLElement;
  Content: (props: PopoverSlotProps) => HTMLElement;
}

// ── Factory ────────────────────────────────────────────────

export function createThemedPopover(styles: PopoverStyleClasses): ThemedPopoverComponent {
  function PopoverTrigger({ children }: PopoverSlotProps): HTMLElement {
    const el = document.createElement('span');
    el.dataset.slot = 'popover-trigger';
    el.style.display = 'contents';
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function PopoverContent({ children, class: className }: PopoverSlotProps): HTMLElement {
    const el = document.createElement('div');
    el.dataset.slot = 'popover-content';
    el.style.display = 'contents';
    if (className) el.classList.add(className);
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }

  function PopoverRoot({ children, ...options }: PopoverRootProps): HTMLElement {
    const onOpenChangeOrig = options.onOpenChange;
    let userTrigger: HTMLElement | null = null;
    let contentChildren: Node[] = [];

    for (const node of resolveChildren(children)) {
      if (!(node instanceof HTMLElement)) continue;
      const slot = node.dataset.slot;
      if (slot === 'popover-trigger') {
        userTrigger = (node.firstElementChild as HTMLElement) ?? node;
      } else if (slot === 'popover-content') {
        contentChildren = Array.from(node.childNodes);
      }
    }

    const primitive = Popover.Root({
      ...options,
      onOpenChange: (isOpen) => {
        if (userTrigger) {
          userTrigger.setAttribute('aria-expanded', String(isOpen));
          userTrigger.setAttribute('data-state', isOpen ? 'open' : 'closed');
        }
        onOpenChangeOrig?.(isOpen);
      },
    });

    // Apply theme class
    primitive.content.classList.add(styles.content);

    // Move content children into the primitive's content
    for (const node of contentChildren) {
      primitive.content.appendChild(node);
    }

    // Wire user's trigger
    if (userTrigger) {
      userTrigger.setAttribute('aria-haspopup', 'dialog');
      userTrigger.setAttribute('aria-controls', primitive.content.id);
      userTrigger.setAttribute('aria-expanded', String(options.defaultOpen ?? false));
      userTrigger.setAttribute('data-state', options.defaultOpen ? 'open' : 'closed');
      userTrigger.addEventListener('click', () => {
        // Delegate to primitive trigger click which handles open/close
        primitive.trigger.click();
      });
      return userTrigger;
    }

    return primitive.trigger;
  }

  PopoverRoot.Trigger = PopoverTrigger;
  PopoverRoot.Content = PopoverContent;

  return PopoverRoot as ThemedPopoverComponent;
}
