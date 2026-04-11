import type { BuildConfig, PostBuildContext, PostBuildHook } from './types';

export function normalizeHooks(onSuccess: BuildConfig['onSuccess']): PostBuildHook[] {
  if (!onSuccess) return [];

  if (Array.isArray(onSuccess)) return onSuccess;

  if (typeof onSuccess === 'function') {
    const fn = onSuccess;
    return [{ name: 'custom', handler: () => fn() }];
  }

  // Single hook object
  return [onSuccess];
}

export async function runHooks(hooks: PostBuildHook[], ctx: PostBuildContext): Promise<void> {
  for (const hook of hooks) {
    await hook.handler(ctx);
  }
}
