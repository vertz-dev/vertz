/**
 * React Refresh Module Setup (vtz dev server)
 *
 * This module script runs after the bootstrap (react-refresh-runtime.js)
 * and before the app entry module. It dynamically imports react-refresh/runtime
 * from /@deps/ and initializes the global registration hooks.
 *
 * If react-refresh is not installed, HMR falls back to full page reload
 * (the global $RefreshReg$/$RefreshSig$ shims are still harmless no-ops).
 */
try {
  const { default: RefreshRuntime } = await import('/@deps/react-refresh/runtime');
  if (typeof globalThis.__vtz_react_refresh_init === 'function') {
    globalThis.__vtz_react_refresh_init(RefreshRuntime);
  }
} catch (e) {
  console.warn('[vtz] react-refresh not found — HMR will use full page reload.', e.message);
}
