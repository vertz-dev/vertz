/**
 * ConfirmDialog component — declarative modal confirmation.
 *
 * Demonstrates:
 * - Fully declarative dialog with `let` signal for open/close state
 * - Reactive JSX attributes (aria-hidden, style) driven by signal
 * - WAI-ARIA dialog pattern (role, aria-modal, aria-labelledby)
 * - Theme dialog styles from @vertz/theme-shadcn via configureTheme()
 * - No DOM manipulation — no effect(), no appendChild, no className assignment
 */

import { css } from '@vertz/ui';
import { button, dialogStyles as themeDialogStyles } from '../styles/components';

const dialogStyles = {
  overlay: themeDialogStyles.overlay,
  wrapper: css({
    wrapper: ['fixed', 'inset:0', 'flex', 'items:center', 'justify:center', 'z:50'],
  }).wrapper,
  panel: themeDialogStyles.panel,
  title: themeDialogStyles.title,
  description: themeDialogStyles.description,
  actions: themeDialogStyles.footer,
};

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
        class={button({ intent: 'destructive', size: 'sm' })}
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
          data-state={isOpen ? 'open' : 'closed'}
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
              aria-label="Close"
              onClick={() => {
                isOpen = false;
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              class={button({ intent: 'destructive', size: 'sm' })}
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
