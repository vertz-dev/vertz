import type { AgentDetail, DefinitionDetail } from '../api/services/definitions';

/**
 * Resolve the selected agent detail from a definition and selected step name.
 * Returns null if no step is selected, the definition is missing, or the step has no agent.
 */
export function resolveSelectedAgent(
  definition: DefinitionDetail | null | undefined,
  selectedStep: string | undefined,
): AgentDetail | null {
  if (!selectedStep || !definition) return null;
  const step = definition.steps.find((s) => s.name === selectedStep);
  return step?.agentDetail ?? null;
}

/**
 * Toggle step selection: deselect if the same step is clicked, otherwise select it.
 */
export function toggleStep(current: string | undefined, clicked: string): string | undefined {
  return current === clicked ? undefined : clicked;
}
