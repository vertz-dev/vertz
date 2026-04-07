import type { WorkflowDefinition } from '@vertz/agents';

export interface StepSummary {
  readonly name: string;
  readonly agent?: string;
  readonly isApproval: boolean;
}

export interface AgentDetail {
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly maxIterations: number;
}

export interface StepDetail {
  readonly name: string;
  readonly agent?: string;
  readonly isApproval: boolean;
  readonly agentDetail: AgentDetail | null;
}

export interface DefinitionDetail {
  readonly name: string;
  readonly steps: readonly StepDetail[];
}

export function extractStepSummaries(wf: WorkflowDefinition): readonly StepSummary[] {
  return wf.steps.map((step) => ({
    name: step.name,
    agent: step.agent?.name,
    isApproval: !!step.approval,
  }));
}

export function extractDefinitionDetail(wf: WorkflowDefinition | null): DefinitionDetail | null {
  if (!wf) return null;

  const steps: StepDetail[] = wf.steps.map((step) => {
    const agentDef = step.agent;
    const agentDetail: AgentDetail | null = agentDef
      ? {
          name: agentDef.name,
          description: agentDef.description ?? '',
          model: `${agentDef.model.provider}/${agentDef.model.model}`,
          systemPrompt: typeof agentDef.prompt.system === 'string' ? agentDef.prompt.system : '',
          tools: Object.keys(agentDef.tools),
          maxIterations: agentDef.loop.maxIterations,
        }
      : null;

    return {
      name: step.name,
      agent: agentDef?.name,
      isApproval: !!step.approval,
      agentDetail,
    };
  });

  return { name: wf.name, steps };
}
