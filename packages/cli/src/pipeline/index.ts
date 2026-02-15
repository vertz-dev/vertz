/**
 * Pipeline Module - Phase 1 Implementation
 * 
 * Unified development pipeline orchestrator for `vertz dev`.
 * 
 * @packageDocumentation
 */

export { PipelineOrchestrator, createPipelineOrchestrator } from './orchestrator';
export type { PipelineConfig, PipelineResult, StageResult } from './orchestrator';
export type { FileCategory, FileChange, Watcher, WatcherConfig, PipelineWatcher, PipelineWatcherHandlers, PipelineStage } from './types';
export { categorizeFileChange, getAffectedStages, getStagesForChanges, createWatcher, createPipelineWatcher } from './watcher';
