/**
 * Domain generation command for DB client codegen.
 *
 * Discovers domain files and generates typed DB client.
 */
export interface DomainGenOptions {
  dryRun?: boolean;
  sourceDir?: string;
}
/**
 * Generate domain action - discovers and generates DB client
 */
export declare function generateDomainAction(options: DomainGenOptions): Promise<void>;
//# sourceMappingURL=domain-gen.d.ts.map
