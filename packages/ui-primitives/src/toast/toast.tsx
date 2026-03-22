/**
 * Toast primitive - live region announcements with aria-live.
 * Uses aria-live="polite" for non-intrusive announcements.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState } from '../utils/aria';
import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { uniqueId } from '../utils/id';

export interface ToastOptions extends ElementAttrs {
  duration?: number;
  politeness?: 'polite' | 'assertive';
}

export interface ToastMessage {
  id: string;
  content: string;
  el: HTMLDivElement;
}

export interface ToastState {
  messages: Signal<ToastMessage[]>;
}

export interface ToastElements {
  region: HTMLDivElement;
}

function RegionElement(politeness: string): HTMLDivElement {
  return (
    <div role="status" aria-live={politeness} aria-atomic="false" data-state="empty" />
  ) as HTMLDivElement;
}

function MessageElement(id: string, content: string): HTMLDivElement {
  return (
    <div role="status" data-toast-id={id} data-state="open">
      {content}
    </div>
  ) as HTMLDivElement;
}

function ToastRoot(options: ToastOptions = {}) {
  const { duration = 5000, politeness = 'polite', ...attrs } = options;
  const state: ToastState = { messages: signal<ToastMessage[]>([]) };

  const region = RegionElement(politeness);
  applyAttrs(region, attrs);

  function announce(content: string): ToastMessage {
    const id = uniqueId('toast');
    const el = MessageElement(id, content);

    const msg: ToastMessage = { id, content, el };
    state.messages.value = [...state.messages.peek(), msg];
    region.appendChild(el);
    setDataState(region, 'active');

    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }

    return msg;
  }

  function dismiss(id: string): void {
    const messages = state.messages.peek().filter((m: ToastMessage) => m.id !== id);
    state.messages.value = messages;

    const el = region.querySelector(`[data-toast-id="${id}"]`);
    if (el) {
      setDataState(el as HTMLElement, 'closed');
      el.remove();
    }

    if (messages.length === 0) {
      setDataState(region, 'empty');
    }
  }

  return { region, state, announce, dismiss };
}

export const Toast: {
  Root: (options?: ToastOptions) => ToastElements & {
    state: ToastState;
    announce: (content: string) => ToastMessage;
    dismiss: (id: string) => void;
  };
} = {
  Root: ToastRoot,
};
