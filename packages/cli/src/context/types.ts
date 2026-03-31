/**
 * A block of context that describes part of a project or framework.
 * Blocks are composed into tool-specific files by adapters.
 */
export interface ContextBlock {
  /** Unique identifier */
  id: string;
  /** Display title (used as section header) */
  title: string;
  /** Category for filtering and grouping */
  category: 'overview' | 'api' | 'ui' | 'cli' | 'conventions';
  /** Markdown content */
  content: string;
  /** Priority (1 = always include, 2 = include if space, 3 = optional) */
  priority: number;
  /** Whether this block is dynamically generated from project state */
  dynamic?: boolean;
}

/**
 * A file to be written by the context engine.
 */
export interface ContextFile {
  /** Path relative to project root */
  path: string;
  /** File content */
  content: string;
}

/**
 * Adapter that generates tool-specific context files from blocks.
 */
export interface ToolAdapter {
  /** Tool name (e.g., 'claude', 'cursor', 'generic') */
  name: string;
  /** Optional filter — only pass matching blocks to generate() */
  filter?: (block: ContextBlock) => boolean;
  /** Generate output files from the given blocks */
  generate(blocks: ContextBlock[]): ContextFile[];
}
