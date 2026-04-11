import type { Result } from '@vertz/errors';
import { invoke } from './ipc.js';
import type { DesktopError, IpcCallOptions, WindowSize } from './types.js';

/**
 * Set the window title.
 */
export function setTitle(
  title: string,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  return invoke<void>('appWindow.setTitle', { title }, options);
}

/**
 * Set the window size. Takes a `WindowSize` object, not positional arguments.
 */
export function setSize(
  size: WindowSize,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  return invoke<void>('appWindow.setSize', { width: size.width, height: size.height }, options);
}

/**
 * Set whether the window is fullscreen.
 */
export function setFullscreen(
  fullscreen: boolean,
  options?: IpcCallOptions,
): Promise<Result<void, DesktopError>> {
  return invoke<void>('appWindow.setFullscreen', { fullscreen }, options);
}

/**
 * Get the current inner size of the window.
 */
export function innerSize(options?: IpcCallOptions): Promise<Result<WindowSize, DesktopError>> {
  return invoke<WindowSize>('appWindow.innerSize', {}, options);
}

/**
 * Minimize the window.
 */
export function minimize(options?: IpcCallOptions): Promise<Result<void, DesktopError>> {
  return invoke<void>('appWindow.minimize', {}, options);
}

/**
 * Close the window and exit the application.
 */
export function close(options?: IpcCallOptions): Promise<Result<void, DesktopError>> {
  return invoke<void>('appWindow.close', {}, options);
}
