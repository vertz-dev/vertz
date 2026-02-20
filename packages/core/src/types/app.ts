export interface CorsConfig {
  origins?: string | string[] | boolean;
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
  exposedHeaders?: string[];
}

// Forward declare EntityDefinition - actual type is in @vertz/server
export interface EntityDefinition {
  readonly name: string;
  readonly model: unknown;
  readonly access: Record<string, unknown>;
  readonly before: Record<string, unknown>;
  readonly after: Record<string, unknown>;
  readonly actions: Record<string, unknown>;
  readonly relations: Record<string, unknown>;
}

export interface AppConfig {
  basePath?: string;
  version?: string;
  cors?: CorsConfig;
  /** Entity definitions for auto-CRUD route generation */
  entities?: EntityDefinition[];
  /** API prefix for entity routes (default: '/api/') */
  apiPrefix?: string;
  /** Enable response schema validation in dev mode (logs warnings but doesn't break response) */
  validateResponses?: boolean;
}
