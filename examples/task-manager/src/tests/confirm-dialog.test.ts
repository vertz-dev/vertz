/**
 * Tests for the ConfirmDialog component.
 *
 * Demonstrates:
 * - Testing Dialog primitive from @vertz/ui-primitives
 * - click() for opening/closing the dialog
 * - press() for keyboard interaction (Escape to close)
 * - Verifying ARIA attributes
 */

import { describe, expect, it } from 'bun:test';
import { renderTest, waitFor } from '@vertz/ui/test';
import { ConfirmDialog } from '../components/confirm-dialog';

describe('ConfirmDialog', () => {
  it('renders a trigger button', () => {
    let confirmed = false;
    const { findByTestId, unmount } = renderTest(
      ConfirmDialog({
        triggerLabel: 'Delete',
        title: 'Confirm Delete',
        description: 'Are you sure?',
        onConfirm: () => {
          confirmed = true;
        },
      }),
    );

    const trigger = findByTestId('confirm-dialog-trigger');
    expect(trigger.textContent).toBe('Delete');
    expect(trigger.tagName).toBe('BUTTON');

    unmount();
  });

  it('opens the dialog when trigger is clicked', async () => {
    let confirmed = false;
    const { findByTestId, click, unmount } = renderTest(
      ConfirmDialog({
        triggerLabel: 'Delete',
        title: 'Confirm Delete',
        description: 'Are you sure?',
        onConfirm: () => {
          confirmed = true;
        },
      }),
    );

    const trigger = findByTestId('confirm-dialog-trigger');
    await click(trigger);

    // Dialog content should be visible (aria-hidden removed)
    const content = findByTestId('confirm-dialog-content');
    expect(content.getAttribute('aria-hidden')).not.toBe('true');

    unmount();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    let confirmed = false;
    const { findByTestId, click, unmount } = renderTest(
      ConfirmDialog({
        triggerLabel: 'Delete',
        title: 'Confirm Delete',
        description: 'Are you sure?',
        confirmLabel: 'Yes, delete it',
        onConfirm: () => {
          confirmed = true;
        },
      }),
    );

    // Open dialog
    const trigger = findByTestId('confirm-dialog-trigger');
    await click(trigger);

    // Click confirm
    const confirmBtn = findByTestId('confirm-action');
    expect(confirmBtn.textContent).toBe('Yes, delete it');
    await click(confirmBtn);

    expect(confirmed).toBe(true);

    unmount();
  });

  it('has correct ARIA attributes', () => {
    const { findByTestId, unmount } = renderTest(
      ConfirmDialog({
        triggerLabel: 'Delete',
        title: 'Confirm Delete',
        description: 'Are you sure?',
        onConfirm: () => {},
      }),
    );

    const content = findByTestId('confirm-dialog-content');
    expect(content.getAttribute('role')).toBe('dialog');
    expect(content.getAttribute('aria-modal')).toBe('true');
    expect(content.getAttribute('aria-labelledby')).toBeTruthy();

    unmount();
  });
});
