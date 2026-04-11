import type { Result } from '@vertz/errors';
import { invoke } from './ipc.js';
import type {
  ConfirmDialogOptions,
  DesktopError,
  IpcCallOptions,
  MessageDialogOptions,
  OpenDialogOptions,
  SaveDialogOptions,
} from './types.js';

/**
 * Show a native file open dialog.
 *
 * Returns the selected path, or `null` if the user cancelled.
 * These are OS-level dialogs (macOS NSOpenPanel, etc.), NOT in-app UI dialogs.
 */
export function open(
  options?: OpenDialogOptions & IpcCallOptions,
): Promise<Result<string | null, DesktopError>> {
  const { timeout, ...dialogOptions } = options ?? {};
  return invoke<string | null>('dialog.open', dialogOptions, { timeout });
}

/**
 * Show a native file save dialog.
 *
 * Returns the chosen path, or `null` if the user cancelled.
 */
export function save(
  options?: SaveDialogOptions & IpcCallOptions,
): Promise<Result<string | null, DesktopError>> {
  const { timeout, ...dialogOptions } = options ?? {};
  return invoke<string | null>('dialog.save', dialogOptions, { timeout });
}

/**
 * Show a native OS confirmation dialog with OK/Cancel buttons.
 *
 * Returns `true` if confirmed, `false` if cancelled.
 */
export function confirm(
  message: string,
  options?: ConfirmDialogOptions & IpcCallOptions,
): Promise<Result<boolean, DesktopError>> {
  const { timeout, ...dialogOptions } = options ?? {};
  return invoke<boolean>('dialog.confirm', { message, ...dialogOptions }, { timeout });
}

/**
 * Show a native OS message dialog with an OK button.
 */
export function message(
  message: string,
  options?: MessageDialogOptions & IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  const { timeout, ...dialogOptions } = options ?? {};
  return invoke<void>('dialog.message', { message, ...dialogOptions }, { timeout });
}
