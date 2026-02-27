// ── Codegen Config Types ────────────────────────────────────────

export type GeneratorName = 'typescript';

const VALID_GENERATORS = new Set<string>(['typescript']);

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
}

// ── Resolved Config ─────────────────────────────────────────────

export interface ResolvedCodegenConfig {
  generators: GeneratorName[];
  outputDir: string;
  format?: boolean;
  incremental?: boolean;
  typescript?: CodegenTypescriptConfig;
}

// ── defineCodegenConfig ─────────────────────────────────────────

export function defineCodegenConfig(config: CodegenConfig): CodegenConfig {
  return config;
}

// ── resolveCodegenConfig ────────────────────────────────────────

export function resolveCodegenConfig(config?: CodegenConfig): ResolvedCodegenConfig {
  return {
    generators: config?.generators ?? ['typescript'],
    outputDir: config?.outputDir ?? '.vertz/generated',
    format: config?.format,
    incremental: config?.incremental,
    typescript: config?.typescript,
  };
}

// ── validateCodegenConfig ───────────────────────────────────────

export function validateCodegenConfig(config: CodegenConfig): string[] {
  const errors: string[] = [];

  if (config.generators.length === 0) {
    errors.push('codegen.generators must contain at least one generator');
  }

  for (const gen of config.generators) {
    if (!VALID_GENERATORS.has(gen)) {
      errors.push(`codegen.generators contains unknown generator: "${gen}"`);
    }
  }

  if (config.typescript?.publishable) {
    const pub = config.typescript.publishable;
    if (!pub.name) {
      errors.push('codegen.typescript.publishable.name is required');
    }
    if (!pub.outputDir) {
      errors.push('codegen.typescript.publishable.outputDir is required');
    }
  }

  return errors;
}
