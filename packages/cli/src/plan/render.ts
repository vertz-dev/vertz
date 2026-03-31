import type { EntityPlan } from './builder';

/**
 * Renders a plan as human-readable text for --dry-run output.
 */
export function renderPlan(plan: EntityPlan): string {
  const lines: string[] = [];

  lines.push(`Plan: add entity "${plan.intent.name}"`);
  lines.push('');

  for (const op of plan.operations) {
    const icon = op.type === 'create' ? 'CREATE' : op.type === 'append' ? 'APPEND' : 'MODIFY';
    lines.push(`  ${icon}  ${op.path}`);
    lines.push(`          ${op.description}`);
  }

  lines.push('');
  lines.push(
    `Summary: ${plan.summary.created} created, ${plan.summary.modified} modified`,
  );

  return lines.join('\n');
}

/**
 * Renders a plan as JSON for agent consumption.
 */
export function renderPlanJson(plan: EntityPlan): string {
  return JSON.stringify({
    entity: plan.intent.name,
    operations: plan.operations.map((op) => ({
      type: op.type,
      path: op.path,
      description: op.description,
    })),
    summary: plan.summary,
  }, null, 2);
}
