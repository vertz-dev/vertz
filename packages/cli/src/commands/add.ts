import { applyPlan } from '../plan/apply';
import { buildEntityPlan } from '../plan/builder';
import { parseEntityIntent } from '../plan/intent';
import { renderPlan, renderPlanJson } from '../plan/render';

interface AddEntityOptions {
  fields: string;
  belongsTo?: string;
  dryRun?: boolean;
  json?: boolean;
}

export async function addEntityAction(
  name: string,
  options: AddEntityOptions,
): Promise<void> {
  const belongsTo = options.belongsTo
    ? options.belongsTo.split(',').map((s) => s.trim())
    : [];

  const intent = parseEntityIntent(name, options.fields, belongsTo);
  const plan = buildEntityPlan(intent);

  if (options.dryRun) {
    if (options.json) {
      console.log(renderPlanJson(plan));
    } else {
      console.log(renderPlan(plan));
    }
    return;
  }

  // Apply the plan
  console.log(`\nAdding entity "${name}"...\n`);
  await applyPlan(plan, process.cwd());
  console.log(`\n✓ Entity "${name}" added.`);
  console.log('  Run `bun run dev` to start with the new entity.');
}
