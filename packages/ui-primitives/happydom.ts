/**
 * Bun preload that registers happy-dom globals for test environments.
 * Skipped under vtz runtime — the native DOM shim handles DOM APIs.
 * Happy-dom normalises dimensional CSS values (e.g. "0" → "0px") which
 * breaks tests that assert exact string values against the DOM shim.
 */
if (!(globalThis as any).__vtz_runtime) {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register();
}
