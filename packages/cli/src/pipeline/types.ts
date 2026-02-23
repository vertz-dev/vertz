/**
 * Pipeline types - Core type definitions
 */

/**
 * Pipeline stages that can be executed
 */
export type PipelineStage = 'analyze' | 'openapi' | 'codegen' | 'build-ui' | 'db-sync';

/**
 * File categories for smart dispatch
 */
export type FileCategory = 'domain' | 'module' | 'schema' | 'service' | 'route' | 'entity' | 'component' | 'config' | 'other';

/**
 * A file change event from the watcher
 */
export interface FileChange {
  type: 'add' | 'change' | 'remove';
  path: string;
  category?: FileCategory;
}

/**
 * Watcher interface
 */
export interface Watcher {
  on(event: 'change', handler: (changes: FileChange[]) => void): void;
  close(): void;
  /** @internal — for testing only */
  _emit(change: FileChange): void;
}

/**
 * Configuration for the watcher
 */
export interface WatcherConfig {
  /** Directory to watch */
  dir: string;
  /** Patterns to ignore */
  ignorePatterns?: string[];
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Callback when files change */
  onChange?: (changes: FileChange[]) => void;
}

/**
 * Pipeline watcher event handlers
 */
export interface PipelineWatcherHandlers {
  analyze: (changes: FileChange[]) => void;
  codegen: (changes: FileChange[]) => void;
  'build-ui': (changes: FileChange[]) => void;
  error: (error: Error) => void;
}

/**
 * Watcher that understands file semantics
 */
export interface PipelineWatcher {
  on<K extends keyof PipelineWatcherHandlers>(event: K, handler: PipelineWatcherHandlers[K]): void;
  close(): void;
}
