/**
 * Pipeline Watcher
 *
 * Smart file watcher that categorizes changes and determines which pipeline stages to run.
 */

import type {
  FileCategory,
  FileChange,
  PipelineStage,
  PipelineWatcher,
  PipelineWatcherHandlers,
  Watcher,
  WatcherConfig,
} from './types';

const DEFAULT_IGNORE_PATTERNS = [
  '/node_modules/',
  '/.git/',
  '/.vertz/generated/',
  '/dist/',
  '/.turbo/',
  '/coverage/',
];

const DEFAULT_DEBOUNCE_MS = 100;

/**
 * Categorize a file change based on its path
 */
export function categorizeFileChange(path: string): FileCategory {
  const normalizedPath = path.replace(/\\/g, '/').toLowerCase();

  // Domain files
  if (normalizedPath.includes('.domain.ts')) {
    return 'domain';
  }

  // Module files
  if (normalizedPath.includes('.module.ts')) {
    return 'module';
  }

  // Schema files
  if (normalizedPath.includes('.schema.ts')) {
    return 'schema';
  }

  // Service files
  if (normalizedPath.includes('.service.ts')) {
    return 'service';
  }

  // Route files
  if (normalizedPath.includes('.route.ts')) {
    return 'route';
  }

  // Component files (.tsx)
  if (normalizedPath.endsWith('.tsx') || normalizedPath.endsWith('.jsx')) {
    return 'component';
  }

  // Config files
  if (
    normalizedPath === 'vertz.config.ts' ||
    normalizedPath === 'vertz.config.js' ||
    normalizedPath === 'vertz.config.mts' ||
    normalizedPath.includes('vertz.config')
  ) {
    return 'config';
  }

  // Default to other (may trigger UI rebuild)
  return 'other';
}

/**
 * Determine which pipeline stages are affected by a file category
 */
export function getAffectedStages(category: FileCategory): PipelineStage[] {
  switch (category) {
    case 'domain':
    case 'module':
    case 'service':
    case 'route':
      // These affect the AppIR, so we need to re-analyze and re-codegen
      return ['analyze', 'codegen'];

    case 'schema':
      // Schema changes only affect codegen (types, DB client)
      return ['codegen'];

    case 'component':
      // Component changes only affect UI build
      return ['build-ui'];

    case 'config':
      // Config changes require full rebuild
      return ['analyze', 'codegen', 'build-ui'];
    default:
      // Other files might affect UI - rebuild UI only
      return ['build-ui'];
  }
}

/**
 * Determine which pipeline stages are affected by a set of file changes
 */
export function getStagesForChanges(changes: FileChange[]): PipelineStage[] {
  const stages = new Set<PipelineStage>();

  for (const change of changes) {
    const category = change.category ?? categorizeFileChange(change.path);
    const affected = getAffectedStages(category);
    affected.forEach((s) => {
      stages.add(s);
    });
  }

  // Always analyze first if codegen is needed
  if (stages.has('codegen') && !stages.has('analyze')) {
    stages.add('analyze');
  }

  return Array.from(stages);
}

/**
 * Create a basic file watcher
 */
export function createWatcher(config: WatcherConfig): Watcher {
  const {
    ignorePatterns = DEFAULT_IGNORE_PATTERNS,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    onChange,
  } = config;

  const handlers: Array<(changes: FileChange[]) => void> = [];
  let pending: FileChange[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function isIgnored(path: string): boolean {
    return ignorePatterns.some((pattern) => path.includes(pattern));
  }

  function flush() {
    if (pending.length === 0) return;

    // Add category to each change
    const changes = pending.map((change) => ({
      ...change,
      category: categorizeFileChange(change.path),
    }));

    const _batch = pending;
    pending = [];

    for (const handler of handlers) {
      handler(changes);
    }

    if (onChange) {
      onChange(changes);
    }
  }

  return {
    on(_event: 'change', handler: (changes: FileChange[]) => void) {
      handlers.push(handler);
    },
    _emit(change: FileChange) {
      if (isIgnored(change.path)) return;
      pending.push(change);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, debounceMs);
    },
    close() {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      pending = [];
    },
  };
}

/**
 * Pipeline Watcher - higher-level watcher with stage dispatch
 *
 * This is the main entry point for the dev command.
 * It wraps the basic watcher with pipeline stage determination.
 */
export class PipelineWatcherImpl implements PipelineWatcher {
  private handlers: Map<
    keyof PipelineWatcherHandlers,
    Array<PipelineWatcherHandlers[keyof PipelineWatcherHandlers]>
  > = new Map();
  private watcher: Watcher;
  private isClosed = false;

  constructor(config: WatcherConfig) {
    this.config = config;
    this.watcher = createWatcher({
      ...config,
      onChange: (changes) => this.handleChanges(changes),
    });
  }

  private handleChanges(changes: FileChange[]) {
    const stages = getStagesForChanges(changes);

    // Emit stage-specific events
    for (const stage of stages) {
      const handlers = this.handlers.get(stage);
      if (handlers) {
        for (const handler of handlers) {
          handler(changes);
        }
      }
    }
  }

  on<K extends keyof PipelineWatcherHandlers>(event: K, handler: PipelineWatcherHandlers[K]): void {
    if (this.isClosed) return;

    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  close(): void {
    this.isClosed = true;
    this.watcher.close();
    this.handlers.clear();
  }
}

/**
 * Create a pipeline watcher
 */
export function createPipelineWatcher(config: WatcherConfig): PipelineWatcher {
  return new PipelineWatcherImpl(config);
}

// Re-export types for convenience
export type { FileCategory, PipelineStage } from './types';
