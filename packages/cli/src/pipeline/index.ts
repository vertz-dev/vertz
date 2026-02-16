/**
 * Pipeline Module - Phase 1 Implementation
 *
 * Unified development pipeline orchestrator for `vertz dev`.
 *
 * @packageDocumentation
 */

export type { PipelineConfig, PipelineResult, StageResult } from './orchestrator';
export { createPipelineOrchestrator, PipelineOrchestrator } from './orchestrator';
export type {
  FileCategory,
  FileChange,
  PipelineStage,
  PipelineWatcher,
  PipelineWatcherHandlers,
  Watcher,
  WatcherConfig,
} from './types';
export {
  categorizeFileChange,
  createPipelineWatcher,
  createWatcher,
  getAffectedStages,
  getStagesForChanges,
} from './watcher';
