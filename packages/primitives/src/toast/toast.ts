/**
 * Toast primitive - live region announcements with aria-live.
 * Uses aria-live="polite" for non-intrusive announcements.
 */

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import { setDataState } from '../utils/aria';
import { uniqueId } from '../utils/id';

export interface ToastOptions {
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

export const Toast = {
  Root(options: ToastOptions = {}): ToastElements & {
    state: ToastState;
    announce: (content: string) => ToastMessage;
    dismiss: (id: string) => void;
  } {
    const { duration = 5000, politeness = 'polite' } = options;
    const state: ToastState = { messages: signal<ToastMessage[]>([]) };

    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'false');
    setDataState(region, 'empty');

    function announce(content: string): ToastMessage {
      const id = uniqueId('toast');
      const el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.setAttribute('data-toast-id', id);
      el.textContent = content;
      setDataState(el, 'open');

      const msg: ToastMessage = { id, content, el };
      const messages = [...state.messages.peek(), msg];
      state.messages.value = messages;
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
  },
};
