declare module '~runtime-adapter' {
  export { adapter } from './types';
  import type { RuntimeAdapter } from './types';
  export const adapter: RuntimeAdapter;
}
