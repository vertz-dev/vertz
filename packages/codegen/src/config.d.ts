export type GeneratorName = 'typescript' | 'cli';
export interface CodegenPublishableConfig {
  /** Package name, e.g., '@myapp/sdk' */
  name: string;
  /** Output directory for the package */
  outputDir: string;
  /** Package version. Default: '0.0.0' */
  version?: string;
}
export interface CodegenTypescriptConfig {
  /** Generate schema re-exports. Default: true */
  schemas?: boolean;
  /** SDK client function name. Default: 'createClient' */
  clientName?: string;
  /** Generate as publishable npm package. Default: false */
  publishable?: CodegenPublishableConfig;
  /** Augmentable types for customer-specific type narrowing */
  augmentableTypes?: string[];
}
export interface CodegenCLIPublishableConfig extends CodegenPublishableConfig {
  /** CLI binary name, e.g., 'myapp' */
  binName: string;
}
export interface CodegenCLIConfig {
  /** Include in generation. Default: false */
  enabled?: boolean;
  /** Generate as publishable npm package. Default: false */
  publishable?: CodegenCLIPublishableConfig;
}
export interface CodegenConfig {
  /** Generators to run. Default: ['typescript'] */
  generators: GeneratorName[];
  /** Output directory. Default: '.vertz/generated' */
  outputDir?: string;
  /** Whether to format output with Biome. Defaults to true. */
  format?: boolean;
  /** Whether to use incremental regeneration (only write changed files). Defaults to true. */
  incremental?: boolean;
  /** TypeScript SDK options */
  typescript?: CodegenTypescriptConfig;
  /** CLI options */
  cli?: CodegenCLIConfig;
}
export interface ResolvedCodegenConfig {
  generators: GeneratorName[];
  outputDir: string;
  format?: boolean;
  incremental?: boolean;
  typescript?: CodegenTypescriptConfig;
  cli?: CodegenCLIConfig;
}
export declare function defineCodegenConfig(config: CodegenConfig): CodegenConfig;
export declare function resolveCodegenConfig(config?: CodegenConfig): ResolvedCodegenConfig;
export declare function validateCodegenConfig(config: CodegenConfig): string[];
//# sourceMappingURL=config.d.ts.map
