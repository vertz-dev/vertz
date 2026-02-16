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
export declare function createDevLoop(deps: DevLoopDeps): DevLoop;
//# sourceMappingURL=dev-loop.d.ts.map
