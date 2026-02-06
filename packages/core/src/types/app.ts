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
}
