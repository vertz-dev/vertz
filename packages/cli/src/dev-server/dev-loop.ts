import type { CompileResult } from '@vertz/compiler';
import type { FileChange } from './watcher';

export interface DevLoopDeps {
  compile(): Promise<CompileResult>;
  startProcess(): void;
  stopProcess(): Promise<void>;
  onFileChange(handler: (changes: FileChange[]) => void): void;
  onCompileSuccess(result: CompileResult): void;
  onCompileError(result: CompileResult): void;
}

export interface DevLoop {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createDevLoop(deps: DevLoopDeps): DevLoop {
  return {
    async start() {
      const result = await deps.compile();

      if (result.success) {
        deps.startProcess();
        deps.onCompileSuccess(result);
      } else {
        deps.onCompileError(result);
      }

      deps.onFileChange(async (_changes) => {
        const recompileResult = await deps.compile();
        if (recompileResult.success) {
          await deps.stopProcess();
          deps.startProcess();
          deps.onCompileSuccess(recompileResult);
        } else {
          deps.onCompileError(recompileResult);
        }
      });
    },
    async stop() {
      await deps.stopProcess();
    },
  };
}
