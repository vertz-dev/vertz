import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface HoverCardOptions {
  openDelay?: number;
  closeDelay?: number;
  onOpenChange?: (open: boolean) => void;
}

export interface HoverCardState {
  open: Signal<boolean>;
}

export interface HoverCardElements {
  trigger: HTMLElement;
  content: HTMLDivElement;
}

export const HoverCard = {
  Root(options: HoverCardOptions = {}): HoverCardElements & { state: HoverCardState } {
    const { openDelay = 700, closeDelay = 300, onOpenChange } = options;
    const contentId = uniqueId('hovercard');
    const state: HoverCardState = { open: signal(false) };
    let openTimeout: ReturnType<typeof setTimeout> | null = null;
    let closeTimeout: ReturnType<typeof setTimeout> | null = null;

    const trigger = document.createElement('span');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');

    const content = document.createElement('div');
    content.setAttribute('role', 'dialog');
    content.id = contentId;
    setHidden(content, true);
    setDataState(content, 'closed');

    function cancelTimers(): void {
      if (openTimeout) {
        clearTimeout(openTimeout);
        openTimeout = null;
      }
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
    }

    function show(): void {
      cancelTimers();
      if (state.open.peek()) return;
      openTimeout = setTimeout(() => {
        state.open.value = true;
        setExpanded(trigger, true);
        setHidden(content, false);
        setDataState(content, 'open');
        onOpenChange?.(true);
        openTimeout = null;
      }, openDelay);
    }

    function hide(): void {
      cancelTimers();
      if (!state.open.peek()) return;
      closeTimeout = setTimeout(() => {
        state.open.value = false;
        setExpanded(trigger, false);
        setDataState(content, 'closed');
        setHiddenAnimated(content, true);
        onOpenChange?.(false);
        closeTimeout = null;
      }, closeDelay);
    }

    // Trigger events
    trigger.addEventListener('mouseenter', show);
    trigger.addEventListener('mouseleave', hide);
    trigger.addEventListener('focus', () => {
      cancelTimers();
      state.open.value = true;
      setExpanded(trigger, true);
      setHidden(content, false);
      setDataState(content, 'open');
      onOpenChange?.(true);
    });
    trigger.addEventListener('blur', (event) => {
      const related = (event as FocusEvent).relatedTarget as Node | null;
      if (related && (trigger.contains(related) || content.contains(related))) return;
      hide();
    });

    // Content events
    content.addEventListener('mouseenter', () => {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
    });
    content.addEventListener('mouseleave', hide);
    content.addEventListener('focusin', () => {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
    });
    content.addEventListener('focusout', (event) => {
      const related = (event as FocusEvent).relatedTarget as Node | null;
      if (related && (trigger.contains(related) || content.contains(related))) return;
      hide();
    });

    function hideImmediate(): void {
      cancelTimers();
      state.open.value = false;
      setExpanded(trigger, false);
      setDataState(content, 'closed');
      setHiddenAnimated(content, true);
      onOpenChange?.(false);
    }

    // Escape to close
    content.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape)) {
        hideImmediate();
        trigger.focus();
      }
    });

    trigger.addEventListener('keydown', (event) => {
      if (isKey(event, Keys.Escape) && state.open.peek()) {
        hideImmediate();
      }
    });

    return { trigger, content, state };
  },
};
