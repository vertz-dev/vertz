export type { TaskGroup, TaskHandle, TaskRunner } from '@vertz/tui';
// Re-export reusable TUI components from @vertz/tui for backwards compatibility
export {
  colors,
  createTaskRunner,
  Message,
  SelectList,
  symbols,
  Task,
  TaskList,
} from '@vertz/tui';
export { createCLI } from './cli';
export { buildAction } from './commands/build';
export { checkAction } from './commands/check';
export { createAction } from './commands/create';
export { deployAction } from './commands/deploy';
export { devAction, registerDevCommand } from './commands/dev';
export { generateAction } from './commands/generate';
export { routesAction } from './commands/routes';
export type { CLIConfig, DevConfig, GeneratedFile, GeneratorDefinition } from './config/defaults';
export { defaultCLIConfig } from './config/defaults';
export { findConfigFile, loadConfig } from './config/loader';
export { detectTarget } from './deploy/detector';
export { createDevLoop } from './dev-server/dev-loop';
export { createProcessManager } from './dev-server/process-manager';
export { createWatcher } from './dev-server/watcher';
export type {
  FileCategory,
  FileChange,
  PipelineConfig,
  PipelineResult,
  PipelineStage,
  PipelineWatcher,
  StageResult,
  Watcher,
} from './pipeline';
// Pipeline exports (Phase 1)
export {
  categorizeFileChange,
  createPipelineOrchestrator,
  createPipelineWatcher,
  getAffectedStages,
  PipelineOrchestrator,
} from './pipeline';
export { formatDiagnostic, formatDiagnosticSummary } from './ui/diagnostic-formatter';
export { formatDuration, formatFileSize, formatPath } from './utils/format';
export { findProjectRoot } from './utils/paths';
export { isCI, requireParam } from './utils/prompt';
export { detectRuntime } from './utils/runtime-detect';
