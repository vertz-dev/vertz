// ── Codegen IR Types ────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type JsonSchema = Record<string, unknown>;

export interface CodegenIR {
  basePath: string;
  version?: string;
  modules: CodegenModule[];
  schemas: CodegenSchema[];
  entities: CodegenEntityModule[];
  auth: CodegenAuth;
}

export interface CodegenModule {
  name: string;
  operations: CodegenOperation[];
}

export interface CodegenOperation {
  operationId: string;
  method: HttpMethod;
  path: string;
  description?: string;
  tags: string[];
  params?: JsonSchema;
  query?: JsonSchema;
  body?: JsonSchema;
  headers?: JsonSchema;
  response?: JsonSchema;
  streaming?: StreamingConfig;
  schemaRefs: OperationSchemaRefs;
  auth?: OperationAuth;
}

export interface StreamingConfig {
  format: 'sse' | 'ndjson';
  eventSchema?: JsonSchema;
}

export interface OperationAuth {
  required: boolean;
  schemes: string[];
}

export interface OperationSchemaRefs {
  params?: string;
  query?: string;
  body?: string;
  headers?: string;
  response?: string;
}

// ── Auth ────────────────────────────────────────────────────────

export interface CodegenAuth {
  schemes: CodegenAuthScheme[];
}

export type CodegenAuthScheme =
  | { type: 'bearer'; name: string; description?: string }
  | { type: 'basic'; name: string; description?: string }
  | {
      type: 'apiKey';
      name: string;
      in: 'header' | 'query' | 'cookie';
      paramName: string;
      description?: string;
    }
  | { type: 'oauth2'; name: string; flows: OAuthFlows; description?: string };

export interface OAuthFlows {
  authorizationCode?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: Record<string, string>;
  };
  clientCredentials?: {
    tokenUrl: string;
    scopes: Record<string, string>;
  };
  deviceCode?: {
    deviceAuthorizationUrl: string;
    tokenUrl: string;
    scopes: Record<string, string>;
  };
}

// ── Schema ──────────────────────────────────────────────────────

export interface CodegenSchema {
  name: string;
  jsonSchema: JsonSchema;
  annotations: SchemaAnnotations;
}

export interface SchemaAnnotations {
  description?: string;
  deprecated?: boolean;
  brand?: string;
  namingParts: SchemaNamingParts;
}

export interface SchemaNamingParts {
  operation?: string;
  entity?: string;
  part?: string;
}

// ── Entity ──────────────────────────────────────────────────────

export interface CodegenEntityModule {
  entityName: string;
  operations: CodegenEntityOperation[];
  actions: CodegenEntityAction[];
}

export interface CodegenEntityOperation {
  kind: 'list' | 'get' | 'create' | 'update' | 'delete';
  method: string;
  path: string;
  operationId: string;
  inputSchema?: string;
  outputSchema?: string;
  resolvedFields?: CodegenResolvedField[];
}

/** Structured field info for schema generation. */
export interface CodegenResolvedField {
  name: string;
  tsType: 'string' | 'number' | 'boolean' | 'date' | 'unknown';
  optional: boolean;
}

export interface CodegenEntityAction {
  name: string;
  operationId: string;
  path: string;
  inputSchema?: string;
  outputSchema?: string;
}

// ── Generator ───────────────────────────────────────────────────

export interface Generator {
  readonly name: string;
  generate(ir: CodegenIR, config: GeneratorConfig): GeneratedFile[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratorConfig {
  outputDir: string;
  options: Record<string, unknown>;
}

// ── Template System ─────────────────────────────────────────────

export interface Import {
  from: string;
  name: string;
  isType: boolean;
  alias?: string;
}

export interface FileFragment {
  content: string;
  imports: Import[];
}
