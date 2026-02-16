export interface FileChange {
  type: 'add' | 'change' | 'remove';
  path: string;
}
export interface Watcher {
  on(event: 'change', handler: (changes: FileChange[]) => void): void;
  close(): void;
  /** @internal — for testing only */
  _emit(change: FileChange): void;
}
export declare function createWatcher(_dir: string): Watcher;
//# sourceMappingURL=watcher.d.ts.map
