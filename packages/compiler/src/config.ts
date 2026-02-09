export interface SchemaConfig {
  enforceNaming: boolean;
  enforcePlacement: boolean;
}

export interface OpenAPIConfig {
  output: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
}

export interface ValidationConfig {
  requireResponseSchema: boolean;
  detectDeadCode: boolean;
}

export interface CompilerConfig {
  sourceDir: string;
  outputDir: string;
  entryFile: string;
  schemas: SchemaConfig;
  openapi: OpenAPIConfig;
  validation: ValidationConfig;
}

// ── Codegen Config ──────────────────────────────────────────────

export type CodegenGeneratorName = 'typescript' | 'cli';

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
  /** Generate as publishable npm package */
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
  /** Generate as publishable npm package */
  publishable?: CodegenCLIPublishableConfig;
}

export interface CodegenConfig {
  /** Generators to run. Default: ['typescript'] */
  generators: CodegenGeneratorName[];
  /** Output directory. Default: '.vertz/generated' */
  outputDir?: string;
  /** TypeScript SDK options */
  typescript?: CodegenTypescriptConfig;
  /** CLI options */
  cli?: CodegenCLIConfig;
}

// ── Vertz Config ────────────────────────────────────────────────

export interface VertzConfig {
  strict?: boolean;
  forceGenerate?: boolean;
  compiler?: Partial<CompilerConfig>;
  codegen?: CodegenConfig;
}

export interface ResolvedConfig {
  strict: boolean;
  forceGenerate: boolean;
  compiler: CompilerConfig;
  codegen?: CodegenConfig;
}

export function defineConfig(config: VertzConfig): VertzConfig {
  return config;
}

export function resolveConfig(config?: VertzConfig): ResolvedConfig {
  return {
    strict: config?.strict ?? false,
    forceGenerate: config?.forceGenerate ?? false,
    codegen: config?.codegen,
    compiler: {
      sourceDir: config?.compiler?.sourceDir ?? 'src',
      outputDir: config?.compiler?.outputDir ?? '.vertz/generated',
      entryFile: config?.compiler?.entryFile ?? 'src/app.ts',
      schemas: {
        enforceNaming: config?.compiler?.schemas?.enforceNaming ?? true,
        enforcePlacement: config?.compiler?.schemas?.enforcePlacement ?? true,
      },
      openapi: {
        output: config?.compiler?.openapi?.output ?? '.vertz/generated/openapi.json',
        info: {
          title: config?.compiler?.openapi?.info?.title ?? 'Vertz API',
          version: config?.compiler?.openapi?.info?.version ?? '1.0.0',
          description: config?.compiler?.openapi?.info?.description,
        },
      },
      validation: {
        requireResponseSchema: config?.compiler?.validation?.requireResponseSchema ?? true,
        detectDeadCode: config?.compiler?.validation?.detectDeadCode ?? true,
      },
    },
  };
}
