import type { CodegenConfig } from '@vertz/codegen';
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
      streaming?: {
        format: 'sse' | 'ndjson';
        eventSchema?: Record<string, unknown>;
      };
      auth?: {
        required: boolean;
        schemes: string[];
      };
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
  auth: {
    schemes: Array<Record<string, unknown>>;
  };
}
export interface GeneratedFile {
  path: string;
  content: string;
}
export interface IncrementalStats {
  written: string[];
  skipped: string[];
  removed: string[];
}
export interface GenerateResult {
  files: GeneratedFile[];
  fileCount: number;
  generators: string[];
  incremental?: IncrementalStats;
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
  /** When false, disables incremental mode and always writes all files. Defaults to true. */
  incremental?: boolean;
}
export interface CodegenResult {
  success: boolean;
  output: string;
  fileCount: number;
}
export declare function codegenAction(options: CodegenOptions): Promise<CodegenResult>;
//# sourceMappingURL=codegen.d.ts.map
