import type { ChildProcess } from 'node:child_process';
export interface ProcessManager {
  start(entryPoint: string, env?: Record<string, string>): void;
  stop(): Promise<void>;
  restart(entryPoint: string, env?: Record<string, string>): Promise<void>;
  isRunning(): boolean;
  onOutput(handler: (data: string) => void): void;
  onError(handler: (data: string) => void): void;
}
export type SpawnFn = (entryPoint: string, env?: Record<string, string>) => ChildProcess;
export declare function createProcessManager(spawnFn?: SpawnFn): ProcessManager;
//# sourceMappingURL=process-manager.d.ts.map
