/**
 * ConfirmDialog component — declarative modal confirmation.
 *
 * Demonstrates:
 * - Fully declarative dialog with `let` signal for open/close state
 * - Reactive JSX attributes (aria-hidden, style) driven by signal
 * - WAI-ARIA dialog pattern (role, aria-modal, aria-labelledby)
 * - No DOM manipulation — no effect(), no appendChild, no className assignment
 */

import { css } from '@vertz/ui';
import { button } from '../styles/components';

const dialogStyles = css({
  overlay: ['fixed', 'inset:0', 'bg:gray.900', 'opacity:50', 'z:40'],
  wrapper: ['fixed', 'inset:0', 'flex', 'items:center', 'justify:center', 'z:50'],
  panel: ['bg:background', 'rounded:lg', 'shadow:xl', 'p:6', 'max-w:md', 'w:full'],
  title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:2'],
  description: ['text:sm', 'text:muted', 'mb:6'],
  actions: ['flex', 'justify:end', 'gap:2'],
});

export interface ConfirmDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

/**
 * Declarative confirmation dialog with trigger button.
 *
 * Uses a `let isOpen` signal for dialog state — the compiler transforms
 * it to a signal and generates reactive attributes for show/hide.
 */
export function ConfirmDialog({
  triggerLabel,
  title: titleText,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
}: ConfirmDialogProps) {
  let isOpen = false;
  const titleId = `dialog-title-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div>
      <button
        type="button"
        class={button({ intent: 'danger', size: 'sm' })}
        data-testid="confirm-dialog-trigger"
        onClick={() => {
          isOpen = true;
        }}
      >
        {triggerLabel}
      </button>
      <div
        class={dialogStyles.overlay}
        aria-hidden={isOpen ? 'false' : 'true'}
        style={isOpen ? '' : 'display: none'}
        onClick={() => {
          isOpen = false;
        }}
      />
      <div class={dialogStyles.wrapper} style={isOpen ? '' : 'display: none'}>
        <div
          class={dialogStyles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-hidden={isOpen ? 'false' : 'true'}
          data-testid="confirm-dialog-content"
        >
          <h2 id={titleId} class={dialogStyles.title}>
            {titleText}
          </h2>
          <p class={dialogStyles.description}>{description}</p>
          <div class={dialogStyles.actions}>
            <button
              type="button"
              class={button({ intent: 'secondary', size: 'sm' })}
              onClick={() => {
                isOpen = false;
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              class={button({ intent: 'danger', size: 'sm' })}
              data-testid="confirm-action"
              onClick={() => {
                onConfirm();
                isOpen = false;
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
