export interface CorsConfig {
  origins?: string | string[] | boolean;
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
  exposedHeaders?: string[];
}

export interface AppConfig {
  basePath?: string;
  version?: string;
  cors?: CorsConfig;
  /**
   * Enable response schema validation in development mode.
   * When enabled, responses are validated against the response schema
   * defined in route handlers and warnings are logged for mismatches.
   * @default false
   */
  validateResponses?: boolean;
}
