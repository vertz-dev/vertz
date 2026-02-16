import type { ServerAdapter } from '../types/server-adapter';
export interface RuntimeHints {
  hasBun: boolean;
}
export declare function detectAdapter(hints?: RuntimeHints): ServerAdapter;
//# sourceMappingURL=detect-adapter.d.ts.map
