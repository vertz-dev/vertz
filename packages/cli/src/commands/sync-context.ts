import { promises as fs } from 'node:fs';
import path from 'node:path';
import { claudeAdapter } from '../context/adapters/claude';
import { copilotAdapter } from '../context/adapters/copilot';
import { cursorAdapter } from '../context/adapters/cursor';
import { genericAdapter } from '../context/adapters/generic';
import { STATIC_BLOCKS } from '../context/blocks/static/index';
import { syncContext } from '../context/sync';
import type { ToolAdapter } from '../context/types';

const ALL_ADAPTERS: ToolAdapter[] = [
  genericAdapter,
  claudeAdapter,
  cursorAdapter,
  copilotAdapter,
];

interface SyncContextOptions {
  /** Only generate for this adapter (e.g., 'claude', 'cursor') */
  only?: string;
  /** Project root directory */
  projectDir?: string;
}

export async function syncContextAction(options: SyncContextOptions = {}): Promise<void> {
  const projectDir = options.projectDir ?? process.cwd();

  // Select adapters
  const adapters = options.only
    ? ALL_ADAPTERS.filter((a) => a.name === options.only)
    : ALL_ADAPTERS;

  if (adapters.length === 0) {
    console.error(
      `Unknown adapter "${options.only}". Available: ${ALL_ADAPTERS.map((a) => a.name).join(', ')}`,
    );
    process.exit(1);
  }

  // TODO: Phase 5 — add dynamic blocks from AppIR here
  // const dynamicBlocks = await loadDynamicBlocks(projectDir);
  // const blocks = [...STATIC_BLOCKS, ...dynamicBlocks];
  const blocks = STATIC_BLOCKS;

  // Generate files
  const files = syncContext({ blocks, adapters });

  // Write files
  for (const file of files) {
    const filePath = path.join(projectDir, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, 'utf-8');
  }

  console.log(`  ✓ Generated ${files.length} context files:`);
  for (const file of files) {
    console.log(`    ${file.path}`);
  }
}
