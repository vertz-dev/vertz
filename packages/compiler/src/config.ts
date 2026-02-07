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

export interface VertzConfig {
  strict?: boolean;
  forceGenerate?: boolean;
  compiler?: Partial<CompilerConfig>;
}

export interface ResolvedConfig {
  strict: boolean;
  forceGenerate: boolean;
  compiler: CompilerConfig;
}

export function defineConfig(config: VertzConfig): VertzConfig {
  return config;
}

export function resolveConfig(config?: VertzConfig): ResolvedConfig {
  return {
    strict: config?.strict ?? false,
    forceGenerate: config?.forceGenerate ?? false,
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
