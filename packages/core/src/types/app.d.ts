export interface CorsConfig {
  origins?: string | string[] | boolean;
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
  exposedHeaders?: string[];
}
export interface DomainDefinition {
  readonly name: string;
  readonly type: string;
  readonly table: unknown;
  readonly exposedRelations: Record<string, unknown>;
  readonly access: Record<string, unknown>;
  readonly handlers: Record<string, unknown>;
  readonly actions: Record<string, unknown>;
}
export interface AppConfig {
  basePath?: string;
  version?: string;
  cors?: CorsConfig;
  /** Domain definitions for auto-CRUD route generation */
  domains?: DomainDefinition[];
  /** API prefix for domain routes (default: '/api/') */
  apiPrefix?: string;
  /** Enable response schema validation in dev mode (logs warnings but doesn't break response) */
  validateResponses?: boolean;
}
//# sourceMappingURL=app.d.ts.map
