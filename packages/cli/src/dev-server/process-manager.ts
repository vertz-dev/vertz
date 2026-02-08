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

export function createProcessManager(spawnFn?: SpawnFn): ProcessManager {
  let child: ChildProcess | undefined;
  const outputHandlers: Array<(data: string) => void> = [];
  const errorHandlers: Array<(data: string) => void> = [];

  return {
    start(entryPoint: string, env?: Record<string, string>) {
      if (child) {
        child.kill('SIGTERM');
        child = undefined;
      }
      if (spawnFn) {
        child = spawnFn(entryPoint, env);
        child.stdout?.on('data', (data: Buffer) => {
          const str = data.toString();
          for (const handler of outputHandlers) {
            handler(str);
          }
        });
        child.stderr?.on('data', (data: Buffer) => {
          const str = data.toString();
          for (const handler of errorHandlers) {
            handler(str);
          }
        });
        child.on('exit', () => {
          child = undefined;
        });
      }
    },
    async stop() {
      if (!child) return;
      const proc = child;
      child = undefined;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 2000);
        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        proc.kill('SIGTERM');
      });
    },
    async restart(entryPoint: string, env?: Record<string, string>) {
      await this.stop();
      this.start(entryPoint, env);
    },
    isRunning() {
      return child !== undefined;
    },
    onOutput(handler: (data: string) => void) {
      outputHandlers.push(handler);
    },
    onError(handler: (data: string) => void) {
      errorHandlers.push(handler);
    },
  };
}
