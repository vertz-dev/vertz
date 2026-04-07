import type { AgentDefinition } from '@vertz/agents';

export interface AgentSummary {
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly toolCount: number;
}

export interface AgentFullDetail {
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly ToolSummary[];
  readonly maxIterations: number;
  readonly tokenBudget?: { max: number; warningThreshold?: number; stopThreshold?: number };
}

export interface ToolSummary {
  readonly name: string;
  readonly description: string;
}

/**
 * Mutable prompt registry that wraps static agent definitions.
 * The original definitions stay frozen; the registry can override the system prompt.
 */
export interface AgentRegistry {
  list(): readonly AgentSummary[];
  get(name: string): AgentFullDetail | null;
  updatePrompt(name: string, prompt: string): boolean;
  getEffectivePrompt(name: string): string | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAgentRegistry(agents: readonly AgentDefinition<any, any, any>[]): AgentRegistry {
  const agentMap = new Map(agents.map((a) => [a.name, a]));
  const promptOverrides = new Map<string, string>();

  return {
    list() {
      return agents.map((a) => ({
        name: a.name,
        description: a.description ?? '',
        model: `${a.model.provider}/${a.model.model}`,
        toolCount: Object.keys(a.tools).length,
      }));
    },

    get(name: string) {
      const a = agentMap.get(name);
      if (!a) return null;

      const effectivePrompt = promptOverrides.get(name)
        ?? (typeof a.prompt.system === 'string' ? a.prompt.system : '');

      const tools: ToolSummary[] = Object.entries(a.tools).map(([toolName, toolDef]) => ({
        name: toolName,
        description: (toolDef as { description?: string }).description ?? '',
      }));

      return {
        name: a.name,
        description: a.description ?? '',
        model: `${a.model.provider}/${a.model.model}`,
        systemPrompt: effectivePrompt,
        tools,
        maxIterations: a.loop.maxIterations,
        tokenBudget: a.loop.tokenBudget
          ? { max: a.loop.tokenBudget.max, warningThreshold: a.loop.tokenBudget.warningThreshold, stopThreshold: a.loop.tokenBudget.stopThreshold }
          : undefined,
      };
    },

    updatePrompt(name: string, prompt: string) {
      if (!agentMap.has(name)) return false;
      promptOverrides.set(name, prompt);
      return true;
    },

    getEffectivePrompt(name: string) {
      const override = promptOverrides.get(name);
      if (override !== undefined) return override;
      const a = agentMap.get(name);
      if (!a) return undefined;
      return typeof a.prompt.system === 'string' ? a.prompt.system : '';
    },
  };
}
