import type { RuntimeAdapter } from './types';

const adapters: Record<string, () => Promise<{ adapter: RuntimeAdapter }>> = {
  node: () => import('./node'),
  bun: () => import('./bun'),
  deno: () => import('./deno'),
  cloudflare: () => import('./cloudflare'),
};

export function resolveRuntimeAdapter(runtime: string): () => Promise<{ adapter: RuntimeAdapter }> {
  const load = adapters[runtime];
  if (!load) {
    throw new Error(
      `Unknown RUNTIME: ${runtime}. Expected one of: ${Object.keys(adapters).join(', ')}`,
    );
  }
  return load;
}

const runtime = process.env.RUNTIME || 'node';
const { adapter } = await resolveRuntimeAdapter(runtime)();

export { adapter };
