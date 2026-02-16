import type { CommandDefinition, ParameterResolver, ResolverContext, SelectOption } from './types';
export interface PromptAdapter {
  select: (options: { message: string; choices: SelectOption[] }) => Promise<string>;
  text: (options: { message: string; defaultValue?: string }) => Promise<string>;
}
export declare class CliRuntimeError extends Error {
  constructor(message: string);
}
export declare function resolveParameters(
  definition: CommandDefinition,
  flags: Record<string, string | boolean>,
  resolvers: Record<string, ParameterResolver>,
  context: ResolverContext,
  promptAdapter?: PromptAdapter,
): Promise<Record<string, unknown>>;
//# sourceMappingURL=resolver.d.ts.map
