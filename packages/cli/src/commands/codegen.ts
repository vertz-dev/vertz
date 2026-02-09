import type { CodegenConfig } from '@vertz/compiler';

export interface CodegenIR {
  basePath: string;
  modules: Array<{
    name: string;
    operations: Array<{
      operationId: string;
      method: string;
      path: string;
      tags: string[];
      schemaRefs: Record<string, string | undefined>;
      description?: string;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
      headers?: Record<string, unknown>;
      response?: Record<string, unknown>;
      streaming?: { format: 'sse' | 'ndjson'; eventSchema?: Record<string, unknown> };
      auth?: { required: boolean; schemes: string[] };
    }>;
  }>;
  schemas: Array<{
    name: string;
    jsonSchema: Record<string, unknown>;
    annotations: {
      namingParts: Record<string, string | undefined>;
      description?: string;
      deprecated?: boolean;
      brand?: string;
    };
  }>;
  auth: { schemes: Array<Record<string, unknown>> };
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateResult {
  files: GeneratedFile[];
  fileCount: number;
  generators: string[];
}

export interface CodegenPipeline {
  validate(config: CodegenConfig): string[];
  generate(ir: CodegenIR, config: CodegenConfig): GenerateResult;
  resolveOutputDir(config: CodegenConfig): string;
}

export interface CodegenOptions {
  config: CodegenConfig | undefined;
  ir: CodegenIR;
  writeFile: (path: string, content: string) => Promise<void>;
  pipeline: CodegenPipeline;
  dryRun?: boolean;
}

export interface CodegenResult {
  success: boolean;
  output: string;
  fileCount: number;
}

export async function codegenAction(options: CodegenOptions): Promise<CodegenResult> {
  const { config, ir, writeFile, pipeline, dryRun = false } = options;

  // No codegen config provided
  if (!config) {
    return {
      success: false,
      output: 'No codegen configuration found. Add a codegen section to vertz.config.ts.',
      fileCount: 0,
    };
  }

  // Validate config
  const errors = pipeline.validate(config);
  if (errors.length > 0) {
    return {
      success: false,
      output: `Invalid codegen configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      fileCount: 0,
    };
  }

  // Generate files
  const result = pipeline.generate(ir, config);
  const outputDir = pipeline.resolveOutputDir(config);

  // Write files (unless dry-run)
  if (!dryRun) {
    try {
      for (const file of result.files) {
        const fullPath = `${outputDir}/${file.path}`;
        await writeFile(fullPath, file.content);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: `Failed to write generated files: ${message}`,
        fileCount: 0,
      };
    }
  }

  return {
    success: true,
    output: `Generated ${result.fileCount} file${result.fileCount === 1 ? '' : 's'} (${result.generators.join(', ')})`,
    fileCount: result.fileCount,
  };
}
