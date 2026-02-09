// ── Codegen Config Types ────────────────────────────────────────

export type GeneratorName = 'typescript' | 'cli';

const VALID_GENERATORS = new Set<string>(['typescript', 'cli']);

export interface CodegenConfig {
  /** Generators to run. Default: ['typescript'] */
  generators: GeneratorName[];

  /** Output directory. Default: '.vertz/generated' */
  outputDir?: string;

  /** TypeScript SDK options */
  typescript?: {
    /** Generate schema re-exports. Default: true */
    schemas?: boolean;
    /** SDK client function name. Default: 'createClient' */
    clientName?: string;
    /** Generate as publishable npm package. Default: false */
    publishable?: {
      /** Package name, e.g., '@myapp/sdk' */
      name: string;
      /** Output directory for the package. e.g., 'packages/sdk' */
      outputDir: string;
      /** Package version. Default: '0.0.0' */
      version?: string;
    };
    /** Augmentable types for customer-specific type narrowing */
    augmentableTypes?: string[];
  };

  /** CLI options */
  cli?: {
    /** Include in generation. Default: false */
    enabled?: boolean;
    /** Generate as publishable npm package. Default: false */
    publishable?: {
      /** Package name, e.g., '@myapp/cli' */
      name: string;
      /** Output directory for the package. e.g., 'packages/cli' */
      outputDir: string;
      /** CLI binary name, e.g., 'myapp' */
      binName: string;
      /** Package version. Default: '0.0.0' */
      version?: string;
    };
  };
}

// ── Resolved Config ─────────────────────────────────────────────

export interface ResolvedCodegenConfig {
  generators: GeneratorName[];
  outputDir: string;
  typescript?: CodegenConfig['typescript'];
  cli?: CodegenConfig['cli'];
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
    typescript: config?.typescript,
    cli: config?.cli,
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

  if (config.cli?.publishable) {
    const pub = config.cli.publishable;
    if (!pub.name) {
      errors.push('codegen.cli.publishable.name is required');
    }
    if (!pub.outputDir) {
      errors.push('codegen.cli.publishable.outputDir is required');
    }
    if (!pub.binName) {
      errors.push('codegen.cli.publishable.binName is required');
    }
  }

  return errors;
}
