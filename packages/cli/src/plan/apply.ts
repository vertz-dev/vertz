import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EntityPlan } from './builder';

/**
 * Applies a plan by creating/modifying files on disk.
 */
export async function applyPlan(plan: EntityPlan, projectDir: string): Promise<void> {
  for (const op of plan.operations) {
    const filePath = path.join(projectDir, op.path);

    if (op.type === 'create') {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, op.content, 'utf-8');
      console.log(`  CREATE  ${op.path}`);
    } else if (op.type === 'append') {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      try {
        const existing = await fs.readFile(filePath, 'utf-8');
        await fs.writeFile(filePath, existing + op.content, 'utf-8');
        console.log(`  APPEND  ${op.path}`);
      } catch {
        // File doesn't exist — create it with import header + content
        const header = "import { d } from 'vertz/db';\n";
        await fs.writeFile(filePath, header + op.content, 'utf-8');
        console.log(`  CREATE  ${op.path} (new)`);
      }
    } else if (op.type === 'modify') {
      // For now, log what needs to be done manually
      // Phase 2: use ts-morph for automatic modification
      console.log(`  MODIFY  ${op.path} — ${op.description}`);
      console.log(`          ⚠ Manual step: add import and register entity in server.ts`);
    }
  }
}
