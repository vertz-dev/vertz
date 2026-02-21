import type { Diagnostic } from '../errors';

// ── Source location mixin ──────────────────────────────────────────

export interface SourceLocation {
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
}

// ── Top-level IR ───────────────────────────────────────────────────

export interface AppIR {
  app: AppDefinition;
  env?: EnvIR;
  modules: ModuleIR[];
  middleware: MiddlewareIR[];
  schemas: SchemaIR[];
  entities: EntityIR[];
  dependencyGraph: DependencyGraphIR;
  diagnostics: Diagnostic[];
}

// ── App ────────────────────────────────────────────────────────────

export interface AppDefinition extends SourceLocation {
  basePath: string;
  version?: string;
  globalMiddleware: MiddlewareRef[];
  moduleRegistrations: ModuleRegistration[];
}

export interface ModuleRegistration {
  moduleName: string;
  options?: Record<string, unknown>;
}

// ── Env ────────────────────────────────────────────────────────────

export interface EnvIR extends SourceLocation {
  loadFiles: string[];
  schema?: SchemaRef;
  variables: EnvVariableIR[];
}

export interface EnvVariableIR {
  name: string;
  type: string;
  hasDefault: boolean;
  required: boolean;
}

// ── Module ─────────────────────────────────────────────────────────

export interface ModuleIR extends SourceLocation {
  name: string;
  imports: ImportRef[];
  options?: SchemaRef;
  services: ServiceIR[];
  routers: RouterIR[];
  exports: string[];
}

export interface ImportRef {
  localName: string;
  sourceModule?: string;
  sourceExport?: string;
  isEnvImport: boolean;
}

// ── Service ────────────────────────────────────────────────────────

export interface ServiceIR extends SourceLocation {
  name: string;
  moduleName: string;
  inject: InjectRef[];
  methods: ServiceMethodIR[];
}

export interface InjectRef {
  localName: string;
  resolvedToken: string;
}

export interface ServiceMethodIR {
  name: string;
  parameters: ServiceMethodParam[];
  returnType: string;
}

export interface ServiceMethodParam {
  name: string;
  type: string;
}

// ── Router ─────────────────────────────────────────────────────────

export interface RouterIR extends SourceLocation {
  name: string;
  moduleName: string;
  prefix: string;
  inject: InjectRef[];
  routes: RouteIR[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface RouteIR extends SourceLocation {
  method: HttpMethod;
  path: string;
  fullPath: string;
  operationId: string;
  params?: SchemaRef;
  query?: SchemaRef;
  body?: SchemaRef;
  headers?: SchemaRef;
  response?: SchemaRef;
  middleware: MiddlewareRef[];
  description?: string;
  tags: string[];
}

// ── Middleware ──────────────────────────────────────────────────────

export interface MiddlewareIR extends SourceLocation {
  name: string;
  inject: InjectRef[];
  headers?: SchemaRef;
  params?: SchemaRef;
  query?: SchemaRef;
  body?: SchemaRef;
  requires?: SchemaRef;
  provides?: SchemaRef;
}

export interface MiddlewareRef {
  name: string;
  sourceFile: string;
}

// ── Schema ─────────────────────────────────────────────────────────

export interface SchemaIR extends SourceLocation {
  name: string;
  id?: string;
  moduleName: string;
  namingConvention: SchemaNameParts;
  jsonSchema?: Record<string, unknown>;
  isNamed: boolean;
}

export interface SchemaNameParts {
  operation?: string;
  entity?: string;
  part?: string;
}

export type SchemaRef = NamedSchemaRef | InlineSchemaRef;

export interface NamedSchemaRef {
  kind: 'named';
  schemaName: string;
  sourceFile: string;
  jsonSchema?: Record<string, unknown>;
}

export interface InlineSchemaRef {
  kind: 'inline';
  sourceFile: string;
  jsonSchema?: Record<string, unknown>;
  resolvedFields?: ResolvedField[];
}

/** Structured field info extracted from resolved TypeScript types. */
export interface ResolvedField {
  name: string;
  tsType: 'string' | 'number' | 'boolean' | 'date' | 'unknown';
  optional: boolean;
}

// ── Entity ─────────────────────────────────────────────────────────

export interface EntityIR extends SourceLocation {
  name: string;
  modelRef: EntityModelRef;
  access: EntityAccessIR;
  hooks: EntityHooksIR;
  actions: EntityActionIR[];
  relations: EntityRelationIR[];
}

export interface EntityModelRef {
  variableName: string;
  importSource?: string;
  tableName?: string;
  schemaRefs: EntityModelSchemaRefs;
}

export interface EntityModelSchemaRefs {
  response?: SchemaRef;
  createInput?: SchemaRef;
  updateInput?: SchemaRef;
  resolved: boolean;
}

export interface EntityAccessIR {
  list: EntityAccessRuleKind;
  get: EntityAccessRuleKind;
  create: EntityAccessRuleKind;
  update: EntityAccessRuleKind;
  delete: EntityAccessRuleKind;
  custom: Record<string, EntityAccessRuleKind>;
}

export type EntityAccessRuleKind = 'none' | 'false' | 'function';

export interface EntityHooksIR {
  before: ('create' | 'update')[];
  after: ('create' | 'update' | 'delete')[];
}

export interface EntityActionIR extends SourceLocation {
  name: string;
  inputSchemaRef: SchemaRef;
  outputSchemaRef: SchemaRef;
}

export interface EntityRelationIR {
  name: string;
  selection: 'all' | string[];
}

// ── Shared context types ──────────────────────────────────────────

export interface ModuleDefContext {
  moduleDefVariables: Map<string, string>;
}

// ── Dependency Graph ───────────────────────────────────────────────

export interface DependencyGraphIR {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  initializationOrder: string[];
  circularDependencies: string[][];
}

export type DependencyNodeKind = 'module' | 'service' | 'router' | 'middleware';

export interface DependencyNode {
  id: string;
  kind: DependencyNodeKind;
  name: string;
  moduleName?: string;
}

export type DependencyEdgeKind = 'imports' | 'inject' | 'uses-middleware' | 'exports';

export interface DependencyEdge {
  from: string;
  to: string;
  kind: DependencyEdgeKind;
}
