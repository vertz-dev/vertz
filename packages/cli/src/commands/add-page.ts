import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildPagePlan } from '../plan/page-builder';

interface AddPageOptions {
  crud?: boolean;
  for?: string;
  dryRun?: boolean;
}

export async function addPageAction(
  name: string,
  options: AddPageOptions,
): Promise<void> {
  const plan = buildPagePlan({
    name,
    crud: !!options.crud,
    forEntity: options.for,
  });

  if (options.dryRun) {
    // Reuse renderPlan format
    const lines = [
      `Plan: add page "${name}"`,
      '',
      ...plan.operations.map((op) =>
        `  ${op.type.toUpperCase()}  ${op.path}\n          ${op.description}`,
      ),
    ];
    console.log(lines.join('\n'));
    return;
  }

  console.log(`\nAdding page "${name}"...\n`);

  for (const op of plan.operations) {
    const filePath = path.join(process.cwd(), op.path);
    if (op.type === 'create') {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, op.content, 'utf-8');
      console.log(`  CREATE  ${op.path}`);
    } else {
      console.log(`  MODIFY  ${op.path} — ${op.description}`);
    }
  }

  console.log(`\n✓ Page "${name}" added.`);
}
