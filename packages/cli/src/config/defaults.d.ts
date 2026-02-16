import type { VertzConfig } from '@vertz/compiler';
export interface DevConfig {
  port: number;
  host: string;
  open: boolean;
  typecheck: boolean;
}
export interface GeneratorArgument {
  name: string;
  description: string;
  required: boolean;
}
export interface GeneratorOption {
  name: string;
  flag: string;
  description: string;
  default?: string;
}
export interface GeneratorContext {
  name: string;
  options: Record<string, string>;
  projectRoot: string;
  sourceDir: string;
  config: VertzConfig;
}
export interface GeneratedFile {
  path: string;
  content: string;
}
export interface GeneratorDefinition {
  name: string;
  description: string;
  arguments: GeneratorArgument[];
  options?: GeneratorOption[];
  run(context: GeneratorContext): Promise<GeneratedFile[]>;
}
export interface CLIConfig extends VertzConfig {
  dev?: DevConfig;
  generators?: Record<string, GeneratorDefinition>;
}
export declare const defaultCLIConfig: CLIConfig;
//# sourceMappingURL=defaults.d.ts.map
