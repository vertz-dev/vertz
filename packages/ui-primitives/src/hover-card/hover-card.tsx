import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState, setExpanded, setHidden, setHiddenAnimated } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import type { FloatingOptions } from '../utils/floating';
import { createFloatingPosition } from '../utils/floating';
import { uniqueId } from '../utils/id';
import { isKey, Keys } from '../utils/keyboard';

export interface HoverCardOptions extends ElementAttrs {
  openDelay?: number;
  closeDelay?: number;
  onOpenChange?: (open: boolean) => void;
  positioning?: FloatingOptions;
}

export interface HoverCardState {
  open: Signal<boolean>;
}

export interface HoverCardElements {
  trigger: HTMLElement;
  content: HTMLDivElement;
}

function HoverCardRoot(
  options: HoverCardOptions = {},
): HoverCardElements & { state: HoverCardState } {
  const { openDelay = 700, closeDelay = 300, onOpenChange, positioning, ...attrs } = options;
  const contentId = uniqueId('hovercard');
  const state: HoverCardState = { open: signal(false) };
  let openTimeout: ReturnType<typeof setTimeout> | null = null;
  let closeTimeout: ReturnType<typeof setTimeout> | null = null;
  let floatingCleanup: (() => void) | null = null;

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

  function cancelCloseTimer(): void {
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
  }

  function positionContent(): void {
    if (positioning) {
      floatingCleanup?.();
      const effectivePlacement = positioning.placement ?? 'bottom';
      const result = createFloatingPosition(trigger, content, {
        ...positioning,
        placement: effectivePlacement,
      });
      floatingCleanup = result.cleanup;
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
      positionContent();
      onOpenChange?.(true);
      openTimeout = null;
    }, openDelay);
  }

  function showImmediate(): void {
    cancelTimers();
    state.open.value = true;
    setExpanded(trigger, true);
    setHidden(content, false);
    setDataState(content, 'open');
    positionContent();
    onOpenChange?.(true);
  }

  function hide(): void {
    cancelTimers();
    if (!state.open.peek()) return;
    closeTimeout = setTimeout(() => {
      state.open.value = false;
      setExpanded(trigger, false);
      setDataState(content, 'closed');
      setHiddenAnimated(content, true);
      floatingCleanup?.();
      floatingCleanup = null;
      onOpenChange?.(false);
      closeTimeout = null;
    }, closeDelay);
  }

  function hideImmediate(): void {
    cancelTimers();
    state.open.value = false;
    setExpanded(trigger, false);
    setDataState(content, 'closed');
    setHiddenAnimated(content, true);
    floatingCleanup?.();
    floatingCleanup = null;
    onOpenChange?.(false);
  }

  function handleTriggerBlur(event: FocusEvent): void {
    const related = event.relatedTarget as Node | null;
    if (related && (trigger.contains(related) || content.contains(related))) return;
    hide();
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    if (isKey(event, Keys.Escape) && state.open.peek()) {
      hideImmediate();
    }
  }

  function handleContentFocusout(event: FocusEvent): void {
    const related = event.relatedTarget as Node | null;
    if (related && (trigger.contains(related) || content.contains(related))) return;
    hide();
  }

  function handleContentKeydown(event: KeyboardEvent): void {
    if (isKey(event, Keys.Escape)) {
      hideImmediate();
      trigger.focus();
    }
  }

  const trigger = (
    <span
      aria-haspopup="dialog"
      aria-expanded="false"
      onMouseenter={show}
      onMouseleave={hide}
      onFocus={showImmediate}
      onBlur={handleTriggerBlur}
      onKeydown={handleTriggerKeydown}
    />
  ) as HTMLElement;

  const content = (
    <div
      role="dialog"
      id={contentId}
      aria-hidden="true"
      data-state="closed"
      style={{ display: 'none' }}
      onMouseenter={cancelCloseTimer}
      onMouseleave={hide}
      onFocusin={cancelCloseTimer}
      onFocusout={handleContentFocusout}
      onKeydown={handleContentKeydown}
    />
  ) as HTMLDivElement;

  applyAttrs(trigger, attrs);

  return { trigger, content, state };
}

export const HoverCard: {
  Root: (options?: HoverCardOptions) => HoverCardElements & { state: HoverCardState };
} = {
  Root: HoverCardRoot,
};
