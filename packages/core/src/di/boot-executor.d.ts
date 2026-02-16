import type { BootSequence } from '../types/boot-sequence';
export declare class BootExecutor {
  private services;
  private shutdownOrder;
  execute(sequence: BootSequence): Promise<Map<string, unknown>>;
  shutdown(): Promise<void>;
  private bootService;
  private resolveDeps;
  private buildServiceMap;
}
//# sourceMappingURL=boot-executor.d.ts.map
