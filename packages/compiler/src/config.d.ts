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
export declare function defineConfig(config: VertzConfig): VertzConfig;
export declare function resolveConfig(config?: VertzConfig): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map
