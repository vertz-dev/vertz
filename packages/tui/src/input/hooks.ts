import { getCurrentApp } from '../app';
import type { KeyEvent } from './key-parser';

// Track registered keyboard callbacks to avoid duplicate registration on re-renders
const registeredCallbacks = new WeakSet<(key: KeyEvent) => void>();

/**
 * Register a keyboard handler for the current app.
 * Calls the callback whenever a key is pressed.
 * Safe to call inside effects — deduplicates registrations.
 */
export function useKeyboard(callback: (key: KeyEvent) => void): void {
  // Prevent duplicate registration when called inside an effect that re-runs
  if (registeredCallbacks.has(callback)) return;
  registeredCallbacks.add(callback);

  const app = getCurrentApp();
  if (!app) return;

  // TestStdin for test key injection
  if (app.testStdin) {
    app.testStdin.onKey(callback);
    return;
  }

  // Real stdin reader — if one exists, register with it
  if (app.stdinReader) {
    app.stdinReader.onKey(callback);
  }
}
