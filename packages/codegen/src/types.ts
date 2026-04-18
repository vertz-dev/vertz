// ── Codegen IR Types ────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type JsonSchema = Record<string, unknown>;

export interface CodegenIR {
  basePath: string;
  version?: string;
  modules: CodegenModule[];
  schemas: CodegenSchema[];
  entities: CodegenEntityModule[];
  services: CodegenServiceModule[];
  auth: CodegenAuth;
  access?: CodegenAccess;
}

// ── Access ────────────────────────────────────────────────────────

export interface CodegenAccess {
  entities: CodegenAccessEntity[];
  entitlements: string[];
  whereClauses: CodegenWhereClause[];
}

export interface CodegenAccessEntity {
  name: string;
  roles: string[];
}

export interface CodegenWhereClause {
  entitlement: string;
  conditions: CodegenWhereCondition[];
}

export type CodegenWhereCondition =
  | { kind: 'marker'; column: string; marker: 'user.id' | 'user.tenantId' }
  | { kind: 'literal'; column: string; value: string | number | boolean };

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
  operations: CodegenAuthOperation[];
}

export interface CodegenAuthOperation {
  /** e.g., 'signIn', 'signUp', 'signOut', 'switchTenant' */
  operationId: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** URL path relative to auth basePath, e.g., '/signin' */
  path: string;
  /** Whether this operation accepts a request body (form-compatible via SdkMethodWithMeta) */
  hasBody: boolean;
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

export interface CodegenRelation {
  name: string;
  type: 'one' | 'many';
  entity: string;
}

export interface CodegenExposeField {
  name: string;
  conditional: boolean;
}

export interface CodegenExposeRelation {
  name: string;
  entity: string;
  type: 'one' | 'many';
  select?: CodegenExposeField[];
  resolvedFields?: CodegenResolvedField[];
}

export interface CodegenEntityModule {
  entityName: string;
  operations: CodegenEntityOperation[];
  actions: CodegenEntityAction[];
  relations?: CodegenRelation[];
  tenantScoped?: boolean;
  table?: string;
  primaryKey?: string;
  hiddenFields?: string[];
  responseFields?: CodegenResolvedField[];
  exposeSelect?: CodegenExposeField[];
  allowWhere?: Array<{ name: string; tsType: CodegenResolvedField['tsType'] }>;
  allowOrderBy?: string[];
  exposeInclude?: CodegenExposeRelation[];
  relationSelections?: Record<string, 'all' | string[]>;
  relationQueryConfig?: Record<
    string,
    { allowWhere?: string[]; allowOrderBy?: string[]; maxLimit?: number }
  >;
}

export interface CodegenEntityOperation {
  kind: 'list' | 'get' | 'create' | 'update' | 'delete';
  method: string;
  path: string;
  operationId: string;
  inputSchema?: string;
  outputSchema?: string;
  resolvedFields?: CodegenResolvedField[];
  responseFields?: CodegenResolvedField[];
}

/** Structured field info for schema generation. */
export interface CodegenResolvedField {
  name: string;
  tsType: 'string' | 'number' | 'boolean' | 'date' | 'unknown';
  optional: boolean;
}

export interface CodegenEntityAction {
  name: string;
  method: string;
  operationId: string;
  path: string;
  hasId: boolean;
  inputSchema?: string;
  outputSchema?: string;
  resolvedInputFields?: CodegenResolvedField[];
  resolvedOutputFields?: CodegenResolvedField[];
}

// ── Service ──────────────────────────────────────────────────────

export interface CodegenServiceModule {
  serviceName: string;
  actions: CodegenServiceAction[];
}

export interface CodegenServiceAction {
  name: string;
  method: HttpMethod;
  path: string;
  operationId: string;
  inputSchema?: string;
  outputSchema?: string;
  pathParams?: string[];
  resolvedInputFields?: CodegenResolvedField[];
  resolvedOutputFields?: CodegenResolvedField[];
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
