/**
 * Toast primitive - live region announcements with aria-live.
 * Uses aria-live="polite" for non-intrusive announcements.
 *
 * Uses direct DOM creation instead of JSX because Toast is an imperative factory
 * whose elements exist outside the component render tree. JSX compiles to __element()
 * calls that participate in the hydration cursor, causing misalignment when Toast({})
 * is called during component initialization (before the JSX return statement).
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

function createRegionElement(politeness: string): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'false');
  el.setAttribute('data-state', 'empty');
  return el;
}

function createMessageElement(id: string, content: string): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('data-toast-id', id);
  el.setAttribute('data-state', 'open');
  el.textContent = content;
  return el;
}

function ToastRoot(options: ToastOptions = {}) {
  const { duration = 5000, politeness = 'polite', ...attrs } = options;
  const state: ToastState = { messages: signal<ToastMessage[]>([]) };

  const region = createRegionElement(politeness);
  applyAttrs(region, attrs);

  function announce(content: string): ToastMessage {
    const id = uniqueId('toast');
    const el = createMessageElement(id, content);

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
