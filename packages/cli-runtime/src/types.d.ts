import type { FetchClient } from '@vertz/fetch';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
export interface FieldDefinition {
  type: string;
  description?: string;
  required: boolean;
  enum?: string[];
}
export interface CommandDefinition {
  method: HttpMethod;
  path: string;
  description: string;
  params?: Record<string, FieldDefinition>;
  query?: Record<string, FieldDefinition>;
  body?: Record<string, FieldDefinition>;
}
export interface CommandManifest {
  [namespace: string]: {
    [command: string]: CommandDefinition;
  };
}
export interface SelectOption {
  label: string;
  value: string;
  description?: string;
}
export interface ResolverContext {
  client: FetchClient;
  args: Record<string, unknown>;
}
export interface ParameterResolver {
  param: string;
  fetchOptions: (context: ResolverContext) => Promise<SelectOption[]>;
  prompt: string;
}
export type OutputFormat = 'json' | 'table' | 'human';
export interface CLIConfig {
  name: string;
  version: string;
  commands: CommandManifest;
  resolvers?: Record<string, ParameterResolver>;
}
//# sourceMappingURL=types.d.ts.map
