/**
 * Pipeline Watcher
 *
 * Smart file watcher that categorizes changes and determines which pipeline stages to run.
 */
import type {
  FileChange,
  Watcher,
  WatcherConfig,
  FileCategory,
  PipelineWatcher,
  PipelineWatcherHandlers,
  PipelineStage,
} from './types';
/**
 * Categorize a file change based on its path
 */
export declare function categorizeFileChange(path: string): FileCategory;
/**
 * Determine which pipeline stages are affected by a file category
 */
export declare function getAffectedStages(category: FileCategory): PipelineStage[];
/**
 * Determine which pipeline stages are affected by a set of file changes
 */
export declare function getStagesForChanges(changes: FileChange[]): PipelineStage[];
/**
 * Create a basic file watcher
 */
export declare function createWatcher(config: WatcherConfig): Watcher;
/**
 * Pipeline Watcher - higher-level watcher with stage dispatch
 *
 * This is the main entry point for the dev command.
 * It wraps the basic watcher with pipeline stage determination.
 */
export declare class PipelineWatcherImpl implements PipelineWatcher {
  private handlers;
  private watcher;
  private config;
  private isClosed;
  constructor(config: WatcherConfig);
  private handleChanges;
  on<K extends keyof PipelineWatcherHandlers>(event: K, handler: PipelineWatcherHandlers[K]): void;
  close(): void;
}
/**
 * Create a pipeline watcher
 */
export declare function createPipelineWatcher(config: WatcherConfig): PipelineWatcher;
export type { FileCategory, PipelineStage } from './types';
//# sourceMappingURL=watcher.d.ts.map
