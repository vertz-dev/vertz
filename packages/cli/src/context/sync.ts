import type { ContextBlock, ContextFile, ToolAdapter } from './types';

interface SyncOptions {
  /** Context blocks to distribute to adapters */
  blocks: ContextBlock[];
  /** Tool adapters that generate output files */
  adapters: ToolAdapter[];
}

/**
 * Synchronizes context blocks into tool-specific files via adapters.
 * Each adapter receives all blocks (or filtered subset) and generates its output files.
 */
export function syncContext({ blocks, adapters }: SyncOptions): ContextFile[] {
  const files: ContextFile[] = [];

  for (const adapter of adapters) {
    const filteredBlocks = adapter.filter
      ? blocks.filter(adapter.filter)
      : blocks;

    const adapterFiles = adapter.generate(filteredBlocks);
    files.push(...adapterFiles);
  }

  return files;
}
